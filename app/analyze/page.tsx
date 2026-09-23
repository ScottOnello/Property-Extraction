import { getPropertyData, type Property } from "@/lib/data";
import { getSixplexData, type SixplexProspect } from "@/lib/sixplex-data";
import { getGarageDealByListingId, type GarageDeal } from "@/lib/garage-data";
import { getAnchorageListingById, type AnchorageListing } from "@/lib/anchorage-listings";
import { getSparkListingPhotos } from "@/lib/spark";
import AnalysisClient from "./AnalysisClient";

function sixplexToProperty(prospect: SixplexProspect): Property {
  const sourceAddress = prospect.Address.trim();
  const city = prospect.City.trim();
  const address = city && sourceAddress.toUpperCase().includes(city.toUpperCase())
    ? sourceAddress
    : [sourceAddress, city, prospect.State, prospect.Postal_Code].filter(Boolean).join(", ");
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
    buildingArea: prospect.Building_Area,
    garageSpaces: null,
    subdivision: "",
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

function garageDealToProperty(deal: GarageDeal): Property {
  const priceReference = deal.List_Price ?? deal.Close_Price ?? 0;
  return {
    parcelId: `mls-${deal.Listing_Id}`,
    address: deal.Address,
    owner: "MLS owner not reported",
    ownerAddress: "",
    ownerCity: "",
    ownerState: "",
    ownerZip: "",
    units: deal.Units || 2,
    buildingArea: deal.Building_Area,
    garageSpaces: deal.Garage_Spaces,
    subdivision: deal.Subdivision,
    deedDate: "",
    yearsOwned: null,
    yearBuilt: deal.Year_Built,
    assessedValue: priceReference,
    zoning: "",
    absentee: false,
    outOfState: false,
    ownerType: "MLS record",
    ownerKey: `mls:${deal.Listing_Id}`,
    baseScore: 0,
    portfolioBonus: 0,
    portfolioCount: 1,
    portfolioUnits: deal.Units || 2,
    score: 0,
    reasons: ["MLS-reported garage", `${deal.Garage_Spaces} garage space${deal.Garage_Spaces === 1 ? "" : "s"}`],
    evidenceUrl: deal.Source_URL || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deal.Address)}`,
    aerialUrl: "",
    latitude: null,
    longitude: null,
    locationScore: 0,
    locationGrade: "Unrated",
    locationTier: "MLS location not geocoded",
    locationReasons: ["MLS address loaded", "Municipal geometry not matched"],
    inTransitCorridor: false,
    transitCorridor: "Unknown",
    transitDistanceMiles: null,
    lotSize: 0,
    yardPotential: "Unknown",
  };
}

function listingToProperty(listing: AnchorageListing): Property {
  return {
    parcelId: `mls-${listing.listingId}`,
    address: listing.address,
    owner: "MLS owner not reported", ownerAddress: "", ownerCity: "", ownerState: "", ownerZip: "",
    units: listing.units ?? 1, buildingArea: listing.buildingArea,
    garageSpaces: listing.garageSpaces, subdivision: listing.subdivision,
    deedDate: "", yearsOwned: null, yearBuilt: listing.yearBuilt,
    assessedValue: listing.listPrice ?? 0, zoning: "", absentee: false, outOfState: false,
    ownerType: "MLS record", ownerKey: `mls:${listing.listingId}`,
    baseScore: 0, portfolioBonus: 0, score: 0, portfolioCount: 1,
    portfolioUnits: listing.units ?? 1, evidenceUrl: listing.sourceUrl || "https://ak.flexmls.com/ticket",
    reasons: [listing.propertySubtype || listing.propertyType || "MLS listing"],
    latitude: listing.latitude, longitude: listing.longitude, aerialUrl: "",
    locationScore: 0, locationGrade: "Unrated", locationTier: "MLS location not scored",
    locationReasons: ["MLS address loaded", "Municipal parcel geometry not matched"],
    inTransitCorridor: false, transitCorridor: "Unknown", transitDistanceMiles: null,
    lotSize: 0, yardPotential: "Unknown",
  };
}

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ parcel?: string; sixplex?: string; listing?: string }> }) {
  const query = await searchParams;
  let subject: Property | undefined;
  let photoCity = "Anchorage";
  let references: { address: string; value: number; yearBuilt: number | null; parcelId: string }[] = [];

  if (query.sixplex) {
    const { confirmed, review } = await getSixplexData();
    const prospect = [...confirmed, ...review].find((item) => item.MLS_Number === query.sixplex);
    if (prospect) {
      subject = sixplexToProperty(prospect);
      photoCity = prospect.City;
    }
    else return <main className="workspace"><h1>Sixplex record unavailable</h1><p>Return to the sixplex list and select the property again.</p></main>;
  }
  if (query.listing) {
    const garageDeal = await getGarageDealByListingId(query.listing);
    if (garageDeal) {
      subject = garageDealToProperty(garageDeal);
      photoCity = garageDeal.City;
    }
    else {
      const listing = await getAnchorageListingById(query.listing);
      if (listing) { subject = listingToProperty(listing); photoCity = listing.city; }
      else return <main className="workspace"><h1>MLS record unavailable</h1><p>Return to Browse Deals and select the property again.</p></main>;
    }
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
  const listingMedia = await getSparkListingPhotos(subject.address, photoCity);
  const streetViewApiKey = process.env.Google_Maps_API?.trim() ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  return <AnalysisClient subject={subject} references={references} listingMedia={listingMedia} streetViewApiKey={streetViewApiKey} />;
}
