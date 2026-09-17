import "server-only";
import { unstable_cache } from "next/cache";
import { getPropertyData, type Property } from "@/lib/data";
import { getSparkListings } from "@/lib/spark";

const ACTIVE_LISTING_FIELDS = [
  "ListingId", "ListingKey", "UnparsedAddress", "City", "StateOrProvince", "PostalCode",
  "StandardStatus", "MlsStatus", "NumberOfUnitsTotal", "ModificationTimestamp",
];

type ListingRow = Record<string, unknown>;

export type OffMarketCandidate = Pick<Property,
  "parcelId" | "address" | "owner" | "ownerCity" | "ownerState" | "deedDate" | "yearsOwned"
  | "yearBuilt" | "assessedValue" | "absentee" | "outOfState" | "score" | "reasons"
  | "latitude" | "longitude" | "locationScore" | "locationTier"
> & {
  screeningTier: "Priority" | "Potential" | "Review";
};

export type OffMarketData = {
  generatedAt: string;
  municipalFetchedAt: string;
  candidates: OffMarketCandidate[];
  longHeldProperties: number;
  activeListingRows: number;
  activeAddressMatchesExcluded: number;
};

function fieldText(value: unknown) {
  const text = String(value ?? "").trim();
  return text === "********" ? "" : text;
}

function canonicalStreetAddress(value: string) {
  const aliases: Record<string, string> = {
    ALLEY: "ALY", AVENUE: "AVE", BOULEVARD: "BLVD", CIRCLE: "CIR", COURT: "CT", DRIVE: "DR",
    EAST: "E", HIGHWAY: "HWY", LANE: "LN", NORTH: "N", PARKWAY: "PKWY", PLACE: "PL",
    ROAD: "RD", SOUTH: "S", SQUARE: "SQ", STREET: "ST", TERRACE: "TER", TRAIL: "TRL",
    WEST: "W",
  };
  return value
    .toUpperCase()
    .replace(/\b(APARTMENT|APT|UNIT|SUITE|STE)\s*#?\s*[A-Z0-9-]+\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => aliases[token] ?? token)
    .join(" ");
}

function listingAddress(row: ListingRow) {
  const fields = (row.StandardFields ?? row) as ListingRow;
  return {
    address: fieldText(fields.UnparsedAddress),
    city: fieldText(fields.City),
    status: fieldText(fields.StandardStatus) || fieldText(fields.MlsStatus),
  };
}

function addressKey(address: string, city: string) {
  const street = canonicalStreetAddress(address);
  const municipality = city.trim().toUpperCase() || "ANCHORAGE";
  return street ? `${street}|${municipality}` : "";
}

function screeningTier(property: Property): OffMarketCandidate["screeningTier"] {
  if (property.score >= 60 && (property.yearsOwned ?? 0) >= 25) return "Priority";
  if (property.score >= 40 || (property.yearsOwned ?? 0) >= 35) return "Potential";
  return "Review";
}

function toOffMarketCandidate(property: Property): OffMarketCandidate {
  // Keep this cache deliberately small. The full municipal Property record
  // includes imagery URLs and detail-only fields that are not needed by the
  // fast queue or map and would exceed Next's 2 MB data-cache limit.
  return {
    parcelId: property.parcelId,
    address: property.address,
    owner: property.owner,
    ownerCity: property.ownerCity,
    ownerState: property.ownerState,
    deedDate: property.deedDate,
    yearsOwned: property.yearsOwned,
    yearBuilt: property.yearBuilt,
    assessedValue: property.assessedValue,
    absentee: property.absentee,
    outOfState: property.outOfState,
    score: property.score,
    reasons: property.reasons,
    latitude: property.latitude,
    longitude: property.longitude,
    locationScore: property.locationScore,
    locationTier: property.locationTier,
    screeningTier: screeningTier(property),
  };
}

async function loadOffMarketCandidates(): Promise<OffMarketData> {
  const [{ properties, fetchedAt }, activeResult] = await Promise.all([
    getPropertyData(),
    getSparkListings({
      // The MLS filter keeps the comparison scoped to currently active
      // four-unit listings, not historic listings in the connected feed.
      filter: "StandardStatus Eq 'Active' And NumberOfUnitsTotal Eq 4",
      orderBy: "-ModificationTimestamp",
      limit: 1000,
      pagination: true,
      select: ACTIVE_LISTING_FIELDS,
    }),
  ]);

  const activeAddressKeys = new Set<string>();
  for (const row of activeResult.Results) {
    const listing = listingAddress(row as ListingRow);
    if (listing.status && listing.status.toLowerCase() !== "active") continue;
    const key = addressKey(listing.address, listing.city);
    if (key) activeAddressKeys.add(key);
  }

  const longHeld = properties.filter((property) => (property.yearsOwned ?? 0) >= 20);
  const candidates = longHeld
    .filter((property) => !activeAddressKeys.has(addressKey(property.address, "Anchorage")))
    .map(toOffMarketCandidate)
    .sort((a, b) => {
      const tierOrder = { Priority: 0, Potential: 1, Review: 2 } as const;
      return tierOrder[a.screeningTier] - tierOrder[b.screeningTier]
        || b.score - a.score
        || (b.yearsOwned ?? 0) - (a.yearsOwned ?? 0)
        || a.address.localeCompare(b.address);
    });

  return {
    generatedAt: new Date().toISOString(),
    municipalFetchedAt: fetchedAt,
    candidates,
    longHeldProperties: longHeld.length,
    activeListingRows: activeResult.Results.length,
    activeAddressMatchesExcluded: longHeld.length - candidates.length,
  };
}

export const getOffMarketCandidates = unstable_cache(
  loadOffMarketCandidates,
  ["off-market-fourplex-candidates-v1"],
  { revalidate: 3600, tags: ["off-market-candidates", "properties"] },
);
