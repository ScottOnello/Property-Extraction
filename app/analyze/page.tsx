import { getPropertyData } from "@/lib/data";
import { getSparkListingPhotos } from "@/lib/spark";
import AnalysisClient from "./AnalysisClient";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ parcel?: string }> }) {
  const query = await searchParams;
  const { properties } = await getPropertyData();
  const subject = properties.find((property) => property.parcelId === query.parcel) ?? properties[0];
  if (!subject) return <main className="workspace"><h1>No properties available</h1></main>;
  const references = properties
    .filter((property) => property.parcelId !== subject.parcelId)
    .sort((a, b) => Math.abs(a.assessedValue - subject.assessedValue) - Math.abs(b.assessedValue - subject.assessedValue))
    .slice(0, 5)
    .map((property) => ({ address: property.address, value: property.assessedValue, yearBuilt: property.yearBuilt, parcelId: property.parcelId }));
  const listingMedia = await getSparkListingPhotos(subject.address);
  return <AnalysisClient subject={subject} references={references} listingMedia={listingMedia} />;
}
