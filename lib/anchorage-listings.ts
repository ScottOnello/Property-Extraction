import "server-only";
import { unstable_cache } from "next/cache";
import { getSparkListings } from "@/lib/spark";

const SELECT = [
  "ListingId", "ListingKey", "UnparsedAddress", "City", "StateOrProvince", "PostalCode",
  "NumberOfUnitsTotal", "PropertyType", "PropertySubType", "BedsTotal", "BathsTotal",
  "BedroomsTotal", "BathroomsTotalInteger", "BathroomsFull", "GarageSpaces", "StandardStatus", "MlsStatus",
  "ListPrice", "BuildingAreaTotal", "LivingArea", "YearBuilt", "ModificationTimestamp",
  "SourceMLSURL", "Latitude", "Longitude", "SubdivisionName",
];

type Row = Record<string, unknown>;

export type AnchorageListing = {
  listingId: string;
  address: string;
  city: string;
  postalCode: string;
  units: number | null;
  propertyType: string;
  propertySubtype: string;
  bedrooms: number | null;
  bathrooms: number | null;
  garageSpaces: number | null;
  status: string;
  listPrice: number | null;
  buildingArea: number | null;
  yearBuilt: number | null;
  modifiedAt: string;
  sourceUrl: string;
  latitude: number | null;
  longitude: number | null;
  subdivision: string;
};

const safeText = (value: unknown) => {
  const result = String(value ?? "").trim();
  return result === "********" ? "" : result;
};
const safeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "" || value === "********") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

function toListing(item: Row): AnchorageListing | null {
  const row = (item.StandardFields ?? item) as Row;
  const listingId = safeText(row.ListingId ?? row.ListingKey ?? item.ListingKey);
  const address = safeText(row.UnparsedAddress);
  const city = safeText(row.City);
  if (!listingId || !address || city.toUpperCase() !== "ANCHORAGE") return null;
  const rawUrl = safeText(row.SourceMLSURL);
  return {
    listingId, address, city, postalCode: safeText(row.PostalCode),
    units: safeNumber(row.NumberOfUnitsTotal),
    propertyType: safeText(row.PropertyType), propertySubtype: safeText(row.PropertySubType),
    bedrooms: safeNumber(row.BedsTotal) ?? safeNumber(row.BedroomsTotal),
    bathrooms: safeNumber(row.BathsTotal) ?? safeNumber(row.BathroomsTotalInteger) ?? safeNumber(row.BathroomsFull),
    garageSpaces: safeNumber(row.GarageSpaces),
    status: safeText(row.StandardStatus) || safeText(row.MlsStatus) || "Unknown",
    listPrice: safeNumber(row.ListPrice),
    buildingArea: safeNumber(row.BuildingAreaTotal) ?? safeNumber(row.LivingArea),
    yearBuilt: safeNumber(row.YearBuilt), modifiedAt: safeText(row.ModificationTimestamp),
    sourceUrl: /^https:\/\//i.test(rawUrl) ? rawUrl : "",
    latitude: safeNumber(row.Latitude), longitude: safeNumber(row.Longitude),
    subdivision: safeText(row.SubdivisionName),
  };
}

async function loadAnchorageListings() {
  const query = {
    filter: "StandardStatus Eq 'Active' And City Eq 'Anchorage'",
    orderBy: "-ModificationTimestamp",
    limit: 1000,
    pagination: true,
    select: SELECT,
  };
  const first = await getSparkListings(query);
  const totalRows = first.Pagination?.TotalRows ?? first.Results.length;
  const totalPages = Math.min(10, Math.ceil(totalRows / 1000));
  const remaining = await Promise.all(Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => getSparkListings({ ...query, page: index + 2 })));
  const rows = [first, ...remaining].flatMap((page) => page.Results);
  const unique = new Map<string, AnchorageListing>();
  for (const item of rows) {
    const listing = toListing(item);
    if (listing && listing.status.toLowerCase() === "active" && !unique.has(listing.listingId)) unique.set(listing.listingId, listing);
  }
  return {
    listings: [...unique.values()],
    totalRows,
    loadedRows: rows.length,
    fetchedAt: new Date().toISOString(),
  };
}

export const getAnchorageListings = unstable_cache(loadAnchorageListings, ["anchorage-active-listings-v2"], { revalidate: 900, tags: ["anchorage-listings"] });

export async function getAnchorageListingById(listingId: string) {
  const safeId = listingId.trim().replace(/'/g, "''");
  if (!safeId) return null;
  const result = await getSparkListings({ filter: `ListingId Eq '${safeId}'`, orderBy: "-ModificationTimestamp", limit: 1, select: SELECT });
  return toListing(result.Results[0] ?? {});
}
