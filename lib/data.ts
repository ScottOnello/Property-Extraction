import { unstable_cache } from "next/cache";

const SERVICE = "https://services2.arcgis.com/Ce3DhLRthdwbHlfF/arcgis/rest/services/PropertyInformation_Hosted/FeatureServer/0/query";
const WHERE = "Total_Living_Units = 4 AND GIS_Category = 'Parcel'";
const FIELDS = ["OBJECTID", "Parcel_ID", "Parcel_ID_URL", "Parcel_Address", "Total_Living_Units", "Owner_Name", "Owner_Address", "Owner_City", "Owner_State", "Owner_Zip", "Deed_Date", "YearBuilt_Min", "Appraised_Total_Value", "Zoning_District", "Lot_Size"].join(",");

export type Property = {
  parcelId: string; address: string; owner: string; ownerAddress: string;
  units: number;
  buildingArea: number | null; garageSpaces: number | null; subdivision: string;
  ownerCity: string; ownerState: string; ownerZip: string; deedDate: string;
  yearsOwned: number | null; yearBuilt: number | null; assessedValue: number;
  zoning: string; absentee: boolean; outOfState: boolean; ownerType: string;
  ownerKey: string; baseScore: number; portfolioBonus: number; score: number;
  portfolioCount: number; portfolioUnits: number; evidenceUrl: string; reasons: string[];
  latitude: number | null; longitude: number | null; aerialUrl: string;
  locationScore: number; locationGrade: string; locationTier: string; locationReasons: string[];
  inTransitCorridor: boolean; transitCorridor: string; transitDistanceMiles: number | null;
  lotSize: number; yardPotential: "Strong" | "Possible" | "Limited" | "Unknown";
};

export type Portfolio = {
  ownerKey: string; owner: string; count: number; units: number; assessedValue: number;
  longHeldCount: number; outOfStateCount: number; score: number; addresses: string[];
};

function normalize(value: unknown) {
  return String(value ?? "").toUpperCase().normalize("NFKD").replace(/[^A-Z0-9]+/g, " ").trim();
}

function normalizeOwner(value: unknown) {
  const entity = /\b(LLC|INC|CORP|CORPORATION|COMPANY|LP|LLP|LTD)\b/i.test(String(value ?? ""));
  const tokens = normalize(value).split(" ").filter(Boolean).filter((token) => !["LLC", "INC", "CORP", "CORPORATION", "COMPANY", "CO", "LP", "LLP", "LTD", "TRUSTEE", "TTEE"].includes(token));
  return `${entity ? "ENTITY" : "PERSON"}:${tokens.join(" ")}`;
}

function yearsSince(epoch: number | null) {
  if (!epoch) return null;
  const acquired = new Date(epoch);
  const now = new Date();
  let years = now.getUTCFullYear() - acquired.getUTCFullYear();
  if ([now.getUTCMonth(), now.getUTCDate()].join("-") < [acquired.getUTCMonth(), acquired.getUTCDate()].join("-")) years -= 1;
  return years;
}

function centroid(geometry: { rings?: number[][][] } | undefined) {
  const points = geometry?.rings?.flat() ?? [];
  if (!points.length) return { latitude: null, longitude: null };
  const longitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return { latitude, longitude };
}

function milesBetween(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = radians(targetLatitude - latitude);
  const deltaLongitude = radians(targetLongitude - longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(targetLatitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointSegmentMiles(latitude: number, longitude: number, start: number[], end: number[]) {
  const referenceLatitude = latitude * Math.PI / 180;
  const x = (value: number) => (value - longitude) * 69 * Math.cos(referenceLatitude);
  const y = (value: number) => (value - latitude) * 69;
  const ax = x(start[1]); const ay = y(start[0]); const bx = x(end[1]); const by = y(end[0]);
  const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / lengthSquared)) : 0;
  return Math.hypot(ax + t * (bx - ax), ay + t * (by - ay));
}

function transitAnalysis(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return { inTransitCorridor: false, transitCorridor: "Unknown", transitDistanceMiles: null };
  const corridors = [
    { name: "Spenard Road", points: [[61.214,-149.905],[61.190,-149.907],[61.175,-149.946]] },
    { name: "15th / DeBarr", points: [[61.207,-149.900],[61.208,-149.733]] },
    { name: "Northern Lights / Benson", points: [[61.196,-149.955],[61.194,-149.775]] },
    { name: "Mountain View / Bragaw", points: [[61.223,-149.840],[61.223,-149.770],[61.180,-149.770]] },
    { name: "Arctic Boulevard", points: [[61.218,-149.890],[61.145,-149.890]] },
    { name: "Muldoon Road", points: [[61.225,-149.740],[61.135,-149.740]] },
    { name: "A/C Street and Tudor", points: [[61.230,-149.880],[61.165,-149.880]] },
    { name: "A/C Street and Tudor", points: [[61.180,-149.950],[61.180,-149.740]] },
    { name: "Lake Otis / Abbott / 92nd", points: [[61.210,-149.840],[61.140,-149.840]] },
    { name: "Lake Otis / Abbott / 92nd", points: [[61.140,-149.840],[61.140,-149.720]] },
    { name: "Lake Otis / Abbott / 92nd", points: [[61.137,-149.970],[61.137,-149.840]] },
    { name: "Jewel Lake Road", points: [[61.195,-149.955],[61.120,-149.955]] },
  ];
  const distances = corridors.map((corridor) => ({ name: corridor.name, distance: Math.min(...corridor.points.slice(1).map((point, index) => pointSegmentMiles(latitude, longitude, corridor.points[index], point))) }));
  const nearest = distances.sort((a, b) => a.distance - b.distance)[0];
  return { inTransitCorridor: nearest.distance <= .25, transitCorridor: nearest.name, transitDistanceMiles: nearest.distance };
}

function locationAnalysis(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return { locationScore: 0, locationGrade: "F", locationTier: "Unrated", locationReasons: ["Parcel geometry unavailable"] };
  const anchors = [
    { name: "Downtown", latitude: 61.2176, longitude: -149.8997, weight: 20, radius: 8 },
    { name: "Midtown", latitude: 61.1907, longitude: -149.8681, weight: 20, radius: 7 },
    { name: "U-Med", latitude: 61.1886, longitude: -149.8174, weight: 25, radius: 9 },
    { name: "Airport", latitude: 61.1743, longitude: -149.9985, weight: 15, radius: 12 },
    { name: "JBER", latitude: 61.2534, longitude: -149.7933, weight: 20, radius: 14 },
  ];
  const measurements = anchors.map((anchor) => ({ ...anchor, miles: milesBetween(latitude, longitude, anchor.latitude, anchor.longitude) }));
  const nearest = [...measurements].sort((a, b) => a.miles - b.miles);
  const rawScore = measurements.reduce((score, anchor) => score + Math.max(0, 1 - anchor.miles / anchor.radius) * anchor.weight, 0);
  const isolationPenalty = nearest[0].miles > 5 ? 15 : nearest[0].miles > 3.5 ? 8 : 0;
  const locationScore = Math.max(0, Math.round(rawScore - isolationPenalty));
  const locationGrade = locationScore >= 72 ? "A" : locationScore >= 60 ? "B" : locationScore >= 48 ? "C" : locationScore >= 35 ? "D" : "F";
  const locationTier = `${nearest[0].name} access area`;
  const locationReasons = nearest.slice(0, 3).map((anchor) => `${anchor.miles.toFixed(1)} mi to ${anchor.name}`);
  if (isolationPenalty) locationReasons.push(`${isolationPenalty}-point outer-area penalty`);
  return { locationScore, locationGrade, locationTier, locationReasons };
}

function aerialUrl(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return "";
  const width = 0.0042;
  const height = 0.0022;
  const bbox = [longitude - width, latitude - height, longitude + width, latitude + height].join(",");
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${new URLSearchParams({ bbox, bboxSR: "4326", imageSR: "4326", size: "900,520", format: "jpg", f: "image" })}`;
}

async function arcgis(params: Record<string, string>) {
  const url = `${SERVICE}?${new URLSearchParams({ f: "json", ...params })}`;
  const response = await fetch(url, { headers: { "User-Agent": "Property-Extraction-Web/0.2" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Anchorage service returned ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message ?? "ArcGIS query failed");
  return body;
}

async function load() {
  const idsResult = await arcgis({ where: WHERE, returnIdsOnly: "true" });
  const ids: number[] = (idsResult.objectIds ?? []).sort((a: number, b: number) => a - b);
  const raw: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const page = await arcgis({ objectIds: ids.slice(index, index + 100).join(","), outFields: FIELDS, returnGeometry: "true", outSR: "4326" });
    raw.push(...(page.features ?? []).map((feature: { attributes: Record<string, unknown>; geometry?: { rings?: number[][][] } }) => ({ ...feature.attributes, __geometry: feature.geometry })));
  }
  if (raw.length !== ids.length) throw new Error(`Completeness check failed: ${raw.length}/${ids.length}`);

  const preliminary = raw.map((row) => {
    const yearsOwned = yearsSince(Number(row.Deed_Date) || null);
    const absentee = Boolean(row.Parcel_Address && row.Owner_Address && normalize(row.Parcel_Address) !== normalize(row.Owner_Address));
    const outOfState = Boolean(row.Owner_State && normalize(row.Owner_State) !== "AK");
    const entity = /\b(LLC|INC|CORP|CORPORATION|COMPANY|LP|LLP|LTD|AUTHORITY|MUNICIPALITY)\b/i.test(String(row.Owner_Name ?? ""));
    const reasons: string[] = [];
    let baseScore = 0;
    if ((yearsOwned ?? 0) >= 35) { baseScore += 40; reasons.push("Owned 35+ years"); }
    else if ((yearsOwned ?? 0) >= 25) { baseScore += 30; reasons.push("Owned 25–34 years"); }
    else if ((yearsOwned ?? 0) >= 20) { baseScore += 20; reasons.push("Owned 20–24 years"); }
    if (absentee) { baseScore += 15; reasons.push("Mailing address differs"); }
    if (outOfState) { baseScore += 20; reasons.push("Out-of-state owner"); }
    if (!entity) { baseScore += 10; reasons.push("Individual/estate/trust"); }
    const built = Number(row.YearBuilt_Min) || null;
    if (built && built <= 1979) { baseScore += 15; reasons.push("Built 1979 or earlier"); }
    else if (built && built <= 1989) { baseScore += 10; reasons.push("Built 1980–1989"); }
    else if (built && built <= 1999) { baseScore += 5; reasons.push("Built 1990–1999"); }
    return { row, yearsOwned, absentee, outOfState, ownerType: entity ? "Entity/government" : "Individual/estate", ownerKey: normalizeOwner(row.Owner_Name), baseScore, reasons, built };
  });

  const groups = new Map<string, typeof preliminary>();
  for (const item of preliminary) groups.set(item.ownerKey, [...(groups.get(item.ownerKey) ?? []), item]);
  const properties: Property[] = preliminary.map((item) => {
    const group = groups.get(item.ownerKey) ?? [item];
    const bonus = group.length >= 5 ? 15 : group.length >= 3 ? 10 : group.length >= 2 ? 5 : 0;
    const row = item.row;
    const point = centroid(row.__geometry as { rings?: number[][][] } | undefined);
    const location = locationAnalysis(point.latitude, point.longitude);
    const transit = transitAnalysis(point.latitude, point.longitude);
    const lotSize = Number(row.Lot_Size) || 0;
    const yardPotential: Property["yardPotential"] = lotSize >= 10000 ? "Strong" : lotSize >= 7000 ? "Possible" : lotSize > 0 ? "Limited" : "Unknown";
    return {
      parcelId: String(row.Parcel_ID ?? ""), address: String(row.Parcel_Address ?? "Unknown address"), owner: String(row.Owner_Name ?? "Unknown owner"),
      units: Number(row.Total_Living_Units) || 4,
      buildingArea: null, garageSpaces: null, subdivision: "",
      ownerAddress: String(row.Owner_Address ?? ""), ownerCity: String(row.Owner_City ?? ""), ownerState: String(row.Owner_State ?? ""), ownerZip: String(row.Owner_Zip ?? ""),
      deedDate: row.Deed_Date ? new Date(Number(row.Deed_Date)).toISOString().slice(0, 10) : "", yearsOwned: item.yearsOwned, yearBuilt: item.built,
      assessedValue: Number(row.Appraised_Total_Value) || 0, zoning: String(row.Zoning_District ?? ""), absentee: item.absentee, outOfState: item.outOfState,
      ownerType: item.ownerType, ownerKey: item.ownerKey, baseScore: item.baseScore, portfolioBonus: bonus, score: Math.min(100, item.baseScore + bonus),
      portfolioCount: group.length, portfolioUnits: group.length * 4, evidenceUrl: String(row.Parcel_ID_URL ?? "https://property.muni.org/"), reasons: item.reasons,
      latitude: point.latitude, longitude: point.longitude, aerialUrl: aerialUrl(point.latitude, point.longitude),
      locationScore: location.locationScore, locationGrade: location.locationGrade, locationTier: location.locationTier, locationReasons: location.locationReasons,
      inTransitCorridor: transit.inTransitCorridor, transitCorridor: transit.transitCorridor, transitDistanceMiles: transit.transitDistanceMiles,
      lotSize, yardPotential,
    };
  }).sort((a, b) => b.score - a.score || (b.yearsOwned ?? 0) - (a.yearsOwned ?? 0));

  const portfolios: Portfolio[] = [...groups.entries()].map(([ownerKey, group]) => ({
    ownerKey, owner: String(group[0].row.Owner_Name ?? "Unknown owner"), count: group.length, units: group.length * 4,
    assessedValue: group.reduce((sum, item) => sum + (Number(item.row.Appraised_Total_Value) || 0), 0),
    longHeldCount: group.filter((item) => (item.yearsOwned ?? 0) >= 20).length, outOfStateCount: group.filter((item) => item.outOfState).length,
    score: Math.max(...group.map((item) => item.baseScore)) + (group.length >= 5 ? 15 : group.length >= 3 ? 10 : group.length >= 2 ? 5 : 0),
    addresses: group.map((item) => String(item.row.Parcel_Address ?? "")).filter(Boolean),
  })).sort((a, b) => b.score - a.score || b.count - a.count);
  return { properties, portfolios, fetchedAt: new Date().toISOString() };
}

export const getPropertyData = unstable_cache(load, ["anchorage-fourplex-v4"], { revalidate: 3600, tags: ["properties"] });
