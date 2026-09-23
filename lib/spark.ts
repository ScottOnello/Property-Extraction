import "server-only";

const SPARK_API_BASE = "https://replication.sparkapi.com/v1";

export type SparkResponse<T> = {
  D: {
    Success: boolean;
    Results: T[];
    Message?: string;
    Code?: number;
    Pagination?: {
      TotalRows?: number;
      PageSize?: number;
      TotalPages?: number;
      CurrentPage?: number;
      CurrentOffset?: number;
      SkipToken?: string;
    };
  };
};

export type SparkListing = Record<string, unknown> & {
  Id?: string;
  ListingKey?: string;
  StandardFields?: Record<string, unknown>;
  ModificationTimestamp?: string;
};

export type SparkListingQuery = {
  filter?: string;
  orderBy?: string;
  limit?: number;
  page?: number;
  skipToken?: string;
  pagination?: boolean;
  select?: string[];
  expand?: string[];
};

export type SparkListingPhoto = {
  id: string;
  caption: string;
  thumbnailUrl: string;
  imageUrl: string;
};

export type SparkListingFacts = {
  buildingArea: number | null;
  garageSpaces: number | null;
  carportSpaces: number | null;
  subdivision: string;
  bedrooms: number | null;
  bathrooms: number | null;
};

export type SparkListingMedia = {
  listingNumber: string;
  photos: SparkListingPhoto[];
  facts: SparkListingFacts;
  addressVerified: boolean;
};

const EMPTY_FACTS: SparkListingFacts = { buildingArea: null, garageSpaces: null, carportSpaces: null, subdivision: "", bedrooms: null, bathrooms: null };

function canonicalStreetAddress(value: unknown) {
  const abbreviations: Record<string, string> = {
    ALLEY: "ALY", AVENUE: "AVE", BOULEVARD: "BLVD", CIRCLE: "CIR", COURT: "CT", DRIVE: "DR",
    EAST: "E", HIGHWAY: "HWY", LANE: "LN", NORTH: "N", PARKWAY: "PKWY", PLACE: "PL",
    ROAD: "RD", SOUTH: "S", STREET: "ST", TERRACE: "TER", TRAIL: "TRL", WEST: "W",
  };
  return String(value ?? "")
    .split(",", 1)[0]
    .toUpperCase()
    .replace(/\b(APARTMENT|APT|UNIT|SUITE|STE)\s*#?\s*[A-Z0-9-]+\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => abbreviations[token] ?? token)
    .join(" ");
}

function canonicalCity(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\bMUNICIPALITY OF\b/g, "")
    .replace(/\s+/g, " ");
}

function listingMatchesAddress(listing: SparkListing, targetAddress: string, targetCity: string) {
  const fields = listing.StandardFields ?? listing;
  const addressMatches = [fields.UnparsedAddress, fields.StreetAddress, listing.UnparsedAddress, listing.StreetAddress]
    .some((address) => canonicalStreetAddress(address) === targetAddress);
  return addressMatches && canonicalCity(fields.City ?? listing.City) === targetCity;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "********") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function listingFacts(fields: Record<string, unknown>): SparkListingFacts {
  return {
    buildingArea: numberOrNull(fields.BuildingAreaTotal) ?? numberOrNull(fields.LivingArea),
    garageSpaces: numberOrNull(fields.GarageSpaces),
    carportSpaces: numberOrNull(fields.CarportSpaces),
    subdivision: String(fields.SubdivisionName ?? "").trim(),
    bedrooms: numberOrNull(fields.BedsTotal) ?? numberOrNull(fields.BedroomsTotal),
    bathrooms: numberOrNull(fields.BathsTotal) ?? numberOrNull(fields.BathroomsTotalInteger) ?? numberOrNull(fields.BathroomsFull),
  };
}

function configuration() {
  const feedId = process.env.SPARK_API_FEED_ID?.trim();
  const accessToken = process.env.SPARK_ACCESS_TOKEN?.trim();

  if (!feedId) throw new Error("SPARK_API_FEED_ID is not configured.");
  if (!accessToken || accessToken.startsWith("replace-with-")) {
    throw new Error("SPARK_ACCESS_TOKEN is not configured.");
  }

  return { feedId, accessToken };
}

async function sparkGet<T>(path: string, parameters: URLSearchParams) {
  const { accessToken } = configuration();

  const response = await fetch(`${SPARK_API_BASE}${path}?${parameters}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "AnchorageFourplexProspector/0.3",
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as SparkResponse<T> | null;
  if (!response.ok || !payload?.D?.Success) {
    const detail = payload?.D?.Message ? `: ${payload.D.Message}` : "";
    throw new Error(`Spark API request failed (${response.status})${detail}`);
  }

  return payload.D;
}

function usableImageUrl(value: unknown) {
  const url = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  // Spark documentation examples include HTTP photo URLs. Serve the secure
  // equivalent when available so deployed pages do not trigger mixed content.
  return url.replace(/^http:\/\//i, "https://");
}

/**
 * Query current Alaska MLS listings through the approved private feed.
 * Keep filters narrow for interactive analysis and use ModificationTimestamp
 * plus skip tokens for incremental synchronization.
 */
export async function getSparkListings(query: SparkListingQuery = {}) {
  const parameters = new URLSearchParams();
  const limit = Math.max(1, Math.min(query.limit ?? 25, 1000));

  parameters.set("_limit", String(limit));
  if (query.filter) parameters.set("_filter", query.filter);
  if (query.orderBy) parameters.set("_orderby", query.orderBy);
  if (query.page) parameters.set("_page", String(Math.max(1, query.page)));
  if (query.skipToken !== undefined) parameters.set("_skiptoken", query.skipToken);
  if (query.pagination) parameters.set("_pagination", "1");
  if (query.select?.length) parameters.set("_select", query.select.join(","));
  if (query.expand?.length) parameters.set("_expand", query.expand.join(","));

  return sparkGet<SparkListing>("/listings", parameters);
}

export async function verifySparkConnection() {
  const result = await sparkGet<Record<string, unknown>>("/my/account", new URLSearchParams());
  return result.Results[0] ?? null;
}

/**
 * Find the most recently modified MLS record for a municipal property and
 * return display-ready MLS images. Spark credentials stay on the server.
 */
export async function getSparkListingPhotos(address: string, city: string) {
  const normalizedAddress = address.split(",")[0]?.trim();
  const targetAddress = canonicalStreetAddress(normalizedAddress);
  const targetCity = canonicalCity(city);
  if (!normalizedAddress || !targetAddress || !targetCity) return { listingNumber: "", photos: [] as SparkListingPhoto[], facts: EMPTY_FACTS, addressVerified: false } satisfies SparkListingMedia;

  try {
    const escapedAddress = normalizedAddress.replace(/'/g, "''");
    // StreetAddress is Spark's address-aware search field. It finds historic
    // records even when an older listing used ROAD instead of RD or had a
    // slightly different formatted address than the assessor record.
    const primary = await getSparkListings({
      filter: `StreetAddress Eq '${escapedAddress}'`,
      orderBy: "-ModificationTimestamp",
      limit: 25,
      select: ["ListingId", "ListingKey", "StreetAddress", "UnparsedAddress", "City", "StateOrProvince", "ModificationTimestamp", "CloseDate", "BuildingAreaTotal", "LivingArea", "GarageSpaces", "CarportSpaces", "SubdivisionName", "BedsTotal", "BathsTotal", "BedroomsTotal", "BathroomsTotalInteger", "BathroomsFull"],
    });
    const pieces = normalizedAddress.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
    const fallbackTerm = pieces.slice(0, Math.min(4, pieces.length)).join(" ").replace(/'/g, "''");
    const primaryMatches = primary.Results.filter((listing) => listingMatchesAddress(listing, targetAddress, targetCity));
    const fallback = primaryMatches.length || !fallbackTerm ? { Results: [] as SparkListing[] } : await getSparkListings({
      filter: `UnparsedAddress Eq contains('${fallbackTerm}')`,
      orderBy: "-ModificationTimestamp",
      limit: 25,
      select: ["ListingId", "ListingKey", "StreetAddress", "UnparsedAddress", "City", "StateOrProvince", "ModificationTimestamp", "CloseDate", "BuildingAreaTotal", "LivingArea", "GarageSpaces", "CarportSpaces", "SubdivisionName", "BedsTotal", "BathsTotal", "BedroomsTotal", "BathroomsTotalInteger", "BathroomsFull"],
    });
    const candidates = [...primaryMatches, ...fallback.Results.filter((listing) => listingMatchesAddress(listing, targetAddress, targetCity))]
      .filter((listing, index, entries) => {
        const id = String(listing.Id ?? listing.ListingKey ?? "");
        return id && entries.findIndex((entry) => String(entry.Id ?? entry.ListingKey ?? "") === id) === index;
      })
      .slice(0, 12);

    let bestFacts = EMPTY_FACTS;
    let bestListingNumber = "";
    for (const listing of candidates) {
      const standard = listing.StandardFields ?? {};
      const candidateFacts = listingFacts(standard);
      if (!bestListingNumber) {
        bestListingNumber = String(standard.ListingId ?? listing.ListingKey ?? "").trim();
        bestFacts = candidateFacts;
      }
      // Photo URLs are a sub-resource of Spark's internal Listing.Id, not the
      // human-facing MLS number. Spark returns it as Id on a listings response.
      const id = String(listing.Id ?? listing.ListingKey ?? standard.ListingKey ?? "").trim();
      const listingNumber = String(standard.ListingId ?? listing.ListingKey ?? "").trim();
      if (!id) continue;
      try {
        const result = await sparkGet<Record<string, unknown>>(`/listings/${encodeURIComponent(id)}/photos`, new URLSearchParams());
        const photos = result.Results.map((photo) => {
          const imageUrl = usableImageUrl(photo.Uri1280 ?? photo.Uri1024 ?? photo.Uri800 ?? photo.Uri640 ?? photo.Uri300);
          const thumbnailUrl = usableImageUrl(photo.UriThumb ?? photo.Uri300 ?? imageUrl);
          return {
            id: String(photo.Id ?? imageUrl),
            caption: String(photo.Caption ?? "").trim(),
            thumbnailUrl,
            imageUrl,
          };
        }).filter((photo) => Boolean(photo.imageUrl));
        if (photos.length) return { listingNumber, photos, facts: candidateFacts, addressVerified: true } satisfies SparkListingMedia;
      } catch {
        // A historical record can be retained while its photos are restricted.
        // Continue through the remaining listing history instead of giving up.
      }
    }

    return { listingNumber: bestListingNumber, photos: [] as SparkListingPhoto[], facts: bestFacts, addressVerified: Boolean(bestListingNumber) } satisfies SparkListingMedia;
  } catch {
    // A missing listing or a feed that restricts photos should not prevent the
    // deal screen from loading. The UI keeps its Street View fallback instead.
    return { listingNumber: "", photos: [] as SparkListingPhoto[], facts: EMPTY_FACTS, addressVerified: false } satisfies SparkListingMedia;
  }
}
