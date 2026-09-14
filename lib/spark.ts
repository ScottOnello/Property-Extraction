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
export async function getSparkListingPhotos(address: string) {
  const normalizedAddress = address.split(",")[0]?.trim();
  if (!normalizedAddress) return { listingNumber: "", photos: [] as SparkListingPhoto[] };

  try {
    const escapedAddress = normalizedAddress.replace(/'/g, "''");
    const listings = await getSparkListings({
      filter: `UnparsedAddress Eq '${escapedAddress}'`,
      orderBy: "ModificationTimestamp Desc",
      limit: 12,
      select: ["ListingId", "ListingKey", "UnparsedAddress", "ModificationTimestamp"],
    });
    const listing = listings.Results[0];
    if (!listing) return { listingNumber: "", photos: [] as SparkListingPhoto[] };

    const standard = listing.StandardFields ?? {};
    // Photo URLs are a sub-resource of Spark's internal Listing.Id, not the
    // human-facing MLS number. Spark returns it as Id on a listings response.
    const id = String(listing.Id ?? listing.ListingKey ?? standard.ListingKey ?? "").trim();
    const listingNumber = String(standard.ListingId ?? listing.ListingKey ?? "").trim();
    if (!id) return { listingNumber, photos: [] as SparkListingPhoto[] };

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

    return { listingNumber, photos };
  } catch {
    // A missing listing or a feed that restricts photos should not prevent the
    // deal screen from loading. The UI keeps its Street View fallback instead.
    return { listingNumber: "", photos: [] as SparkListingPhoto[] };
  }
}
