import { unstable_cache } from "next/cache";

const SERVICE = "https://services2.arcgis.com/Ce3DhLRthdwbHlfF/arcgis/rest/services/PropertyInformation_Hosted/FeatureServer/0/query";
const WHERE = "Total_Living_Units = 4 AND GIS_Category = 'Parcel'";
const FIELDS = ["OBJECTID", "Parcel_ID", "Parcel_ID_URL", "Parcel_Address", "Total_Living_Units", "Owner_Name", "Owner_Address", "Owner_City", "Owner_State", "Owner_Zip", "Deed_Date", "YearBuilt_Min", "Appraised_Total_Value", "Zoning_District"].join(",");

export type Property = {
  parcelId: string; address: string; owner: string; ownerAddress: string;
  ownerCity: string; ownerState: string; ownerZip: string; deedDate: string;
  yearsOwned: number | null; yearBuilt: number | null; assessedValue: number;
  zoning: string; absentee: boolean; outOfState: boolean; ownerType: string;
  ownerKey: string; baseScore: number; portfolioBonus: number; score: number;
  portfolioCount: number; portfolioUnits: number; evidenceUrl: string; reasons: string[];
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
    const page = await arcgis({ objectIds: ids.slice(index, index + 100).join(","), outFields: FIELDS, returnGeometry: "false" });
    raw.push(...(page.features ?? []).map((feature: { attributes: Record<string, unknown> }) => feature.attributes));
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
    return {
      parcelId: String(row.Parcel_ID ?? ""), address: String(row.Parcel_Address ?? "Unknown address"), owner: String(row.Owner_Name ?? "Unknown owner"),
      ownerAddress: String(row.Owner_Address ?? ""), ownerCity: String(row.Owner_City ?? ""), ownerState: String(row.Owner_State ?? ""), ownerZip: String(row.Owner_Zip ?? ""),
      deedDate: row.Deed_Date ? new Date(Number(row.Deed_Date)).toISOString().slice(0, 10) : "", yearsOwned: item.yearsOwned, yearBuilt: item.built,
      assessedValue: Number(row.Appraised_Total_Value) || 0, zoning: String(row.Zoning_District ?? ""), absentee: item.absentee, outOfState: item.outOfState,
      ownerType: item.ownerType, ownerKey: item.ownerKey, baseScore: item.baseScore, portfolioBonus: bonus, score: Math.min(100, item.baseScore + bonus),
      portfolioCount: group.length, portfolioUnits: group.length * 4, evidenceUrl: String(row.Parcel_ID_URL ?? "https://property.muni.org/"), reasons: item.reasons,
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

export const getPropertyData = unstable_cache(load, ["anchorage-fourplex-v2"], { revalidate: 3600, tags: ["properties"] });
