import { getPropertyData, type Property } from "@/lib/data";
import { getSixplexData, type SixplexProspect } from "@/lib/sixplex-data";
import { getSparkListingPhotos } from "@/lib/spark";
import AnalysisClient from "./AnalysisClient";

function sixplexToProperty(prospect: SixplexProspect): Property {
  const address = [prospect.Address, prospect.City, prospect.State, prospect.Postal_Code].filter(Boolean).join(", ");
  const owner = prospect.Owner_Name || "Owner unavailable";
  const ownerType = /\b(LLC|INC|CORP|COMPANY|LP|LLP|LTD|TRUST)\b/i.test(owner) ? "Entity/trust" : "Individual/estate";
  return {
    parcelId: `sixplex-${prospect.MLS_Number}`,
    address: address || "Address unavailable",
    owner,
    ownerAddress: prospect.Owner_Mailing_Address,
    ownerCity: prospect.Owner_Mailing_City,
    ownerState: prospect.Owner_Mailing_State,
    ownerZip: prospect.Owner_Mailing_Zip,
    units: 6,
    deedDate: prospect.Assessor_Deed_Date,
    yearsOwned: prospect.Years_Since_Assessor_Deed,
    yearBuilt: prospect.Year_Built,
    assessedValue: prospect.Assessed_Value ?? prospect.Latest_List_Price ?? prospect.Latest_Close_Price ?? 0,
    zoning: prospect.Zoning,
    absentee: false,
    outOfState: Boolean(prospect.Owner_Mailing_State && prospect.Owner_Mailing_State.toUpperCase() !== "AK"),
    ownerType,
    ownerKey: `sixplex:${prospect.MLS_Number}`,
    baseScore: prospect.Verification_Strength === "High" ? 60 : 40,
    portfolioBonus: 0,
    score: prospect.Verification_Strength === "High" ? 60 : 40,
    portfolioCount: 1,
    portfolioUnits: 6,
    evidenceUrl: prospect.Assessor_Source_URL || "https://property.muni.org/",
    reasons: [prospect.Evidence_Class],
    latitude: null,
    longitude: null,
    aerialUrl: "",
    locationScore: 0,
    locationGrade: "Unrated",
    locationTier: "Location not scored",
    locationReasons: ["No municipal parcel geometry was matched"],
    inTransitCorridor: false,
    transitCorridor: "Unknown",
    transitDistanceMiles: null,
    lotSize: prospect.Lot_Size ?? 0,
    yardPotential: "Unknown",
  };
}

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ parcel?: string; sixplex?: string }> }) {
  const query = await searchParams;
  let subject: Property | undefined;
  let references: { address: string; value: number; yearBuilt: number | null; parcelId: string }[] = [];

  if (query.sixplex) {
    const { confirmed, review } = await getSixplexData();
    const prospect = [...confirmed, ...review].find((item) => item.MLS_Number === query.sixplex);
    if (prospect) subject = sixplexToProperty(prospect);
    else return <main className="workspace"><h1>Sixplex record unavailable</h1><p>Return to the sixplex list and select the property again.</p></main>;
  }

  if (!subject) {
    const { properties } = await getPropertyData();
    subject = properties.find((property) => property.parcelId === query.parcel) ?? properties[0];
    references = properties
      .filter((property) => property.parcelId !== subject?.parcelId)
      .sort((a, b) => Math.abs(a.assessedValue - (subject?.assessedValue ?? 0)) - Math.abs(b.assessedValue - (subject?.assessedValue ?? 0)))
      .slice(0, 5)
      .map((property) => ({ address: property.address, value: property.assessedValue, yearBuilt: property.yearBuilt, parcelId: property.parcelId }));
  }
  if (!subject) return <main className="workspace"><h1>No properties available</h1></main>;
  const listingMedia = await getSparkListingPhotos(subject.address);
  return <AnalysisClient subject={subject} references={references} listingMedia={listingMedia} />;
}
