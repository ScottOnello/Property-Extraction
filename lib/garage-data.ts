import "server-only";
import { unstable_cache } from "next/cache";
import { getSparkListings } from "@/lib/spark";

const SELECT = [
  "ListingId", "ListingKey", "UnparsedAddress", "City", "StateOrProvince", "PostalCode", "Latitude", "Longitude",
  "NumberOfUnitsTotal", "GarageSpaces", "CarportSpaces", "PropertyType", "PropertySubType",
  "StandardStatus", "MlsStatus", "ListPrice", "ClosePrice", "CloseDate", "ModificationTimestamp",
  "YearBuilt", "BuildingAreaTotal", "LivingArea", "SubdivisionName", "BedsTotal", "BathsTotal",
  "BedroomsTotal", "BathroomsTotalInteger", "SourceMLSURL", "OwnerName",
];

type Row = Record<string, unknown>;

export type GarageDeal = {
  Listing_Id: string;
  Address: string;
  City: string;
  State: string;
  Postal_Code: string;
  Latitude: number | null;
  Longitude: number | null;
  Units: number | null;
  Garage_Spaces: number;
  Carport_Spaces: number | null;
  Property_Type: string;
  Property_Subtype: string;
  Status: string;
  List_Price: number | null;
  Close_Price: number | null;
  Close_Date: string;
  Year_Built: number | null;
  Building_Area: number | null;
  Subdivision: string;
  Bedrooms: number | null;
  Bathrooms: number | null;
  Modified_At: string;
  Source_URL: string;
};

const text = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized === "********" ? "" : normalized;
};
const usableUrl = (value: unknown) => {
  const url = text(value);
  return /^https?:\/\//i.test(url) ? url : "";
};
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "" || value === "********") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const dateOnly = (value: unknown) => {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString().slice(0, 10) : "";
};
const addressKey = (value: string, city: string) => `${value.toUpperCase().replace(/[^A-Z0-9]/g, "")}|${city.toUpperCase()}`;
const coordinateOrNull = (value: unknown, minimum: number, maximum: number) => {
  const coordinate = numberOrNull(value);
  return coordinate !== null && coordinate >= minimum && coordinate <= maximum ? coordinate : null;
};

function toGarageDeal(row: Row): GarageDeal | null {
  const listingId = text(row.ListingId ?? row.ListingKey);
  const garageSpaces = numberOrNull(row.GarageSpaces);
  const address = text(row.UnparsedAddress);
  if (!listingId || !address || !garageSpaces || garageSpaces <= 0) return null;

  return {
    Listing_Id: listingId,
    Address: address,
    City: text(row.City),
    State: text(row.StateOrProvince) || "AK",
    Postal_Code: text(row.PostalCode),
    Latitude: coordinateOrNull(row.Latitude, -90, 90),
    Longitude: coordinateOrNull(row.Longitude, -180, 180),
    Units: numberOrNull(row.NumberOfUnitsTotal),
    Garage_Spaces: garageSpaces,
    Carport_Spaces: numberOrNull(row.CarportSpaces),
    Property_Type: text(row.PropertyType),
    Property_Subtype: text(row.PropertySubType),
    Status: text(row.StandardStatus) || text(row.MlsStatus) || "Unknown",
    List_Price: numberOrNull(row.ListPrice),
    Close_Price: numberOrNull(row.ClosePrice),
    Close_Date: dateOnly(row.CloseDate),
    Year_Built: numberOrNull(row.YearBuilt),
    Building_Area: numberOrNull(row.BuildingAreaTotal) ?? numberOrNull(row.LivingArea),
    Subdivision: text(row.SubdivisionName),
    Bedrooms: numberOrNull(row.BedsTotal) ?? numberOrNull(row.BedroomsTotal),
    Bathrooms: numberOrNull(row.BathsTotal) ?? numberOrNull(row.BathroomsTotalInteger),
    Modified_At: text(row.ModificationTimestamp),
    Source_URL: usableUrl(row.SourceMLSURL),
  };
}

async function loadGarageDeals() {
  const result = await getSparkListings({
    filter: "GarageSpaces Gt 0 And NumberOfUnitsTotal Gt 1",
    orderBy: "-ModificationTimestamp",
    limit: 1000,
    pagination: true,
    select: SELECT,
  });

  const newestByAddress = new Map<string, GarageDeal>();
  for (const item of result.Results) {
    const deal = toGarageDeal((item.StandardFields ?? item) as Row);
    if (!deal) continue;
    const key = addressKey(deal.Address, deal.City);
    if (!newestByAddress.has(key)) newestByAddress.set(key, deal);
  }

  const deals = [...newestByAddress.values()].sort((a, b) => b.Modified_At.localeCompare(a.Modified_At));
  return { generatedAt: new Date().toISOString(), deals, sourceRows: result.Results.length };
}

export async function getGarageDealByListingId(listingId: string) {
  const safeListingId = listingId.trim().replace(/'/g, "''");
  if (!safeListingId) return null;
  const result = await getSparkListings({
    filter: `ListingId Eq '${safeListingId}'`,
    orderBy: "-ModificationTimestamp",
    limit: 1,
    select: SELECT,
  });
  return toGarageDeal((result.Results[0]?.StandardFields ?? result.Results[0] ?? {}) as Row);
}

export const getGarageDeals = unstable_cache(loadGarageDeals, ["alaska-multifamily-garage-deals-v2"], { revalidate: 3600, tags: ["garage-deals"] });
