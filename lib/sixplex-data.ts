import "server-only";
import { unstable_cache } from "next/cache";
import { getSparkListings } from "@/lib/spark";

const ASSESSOR = "https://services2.arcgis.com/Ce3DhLRthdwbHlfF/arcgis/rest/services/PropertyInformation_Hosted/FeatureServer/0/query";
const CUTOFF = new Date("2001-09-01T00:00:00Z");
const SELECT = ["ListingId","UnparsedAddress","City","StateOrProvince","PostalCode","NumberOfUnitsTotal","PropertyType","PropertySubType","StandardStatus","MlsStatus","ListPrice","ClosePrice","CloseDate","ModificationTimestamp","YearBuilt","BuildingAreaTotal","OwnerName","YearsCurrentOwner","ListOfficeName","SourceMLSURL"];

export type SixplexProspect = {
  Address: string; City: string; State: string; Postal_Code: string; Owner_Name: string;
  Owner_Mailing_Address: string; Owner_Mailing_City: string; Owner_Mailing_State: string; Owner_Mailing_Zip: string;
  Assessor_Deed_Date: string; Years_Since_Assessor_Deed: number | null; Latest_MLS_Close_Date: string;
  Latest_MLS_Status: string; Latest_List_Price: number | null; Latest_Close_Price: number | null;
  Year_Built: number | null; Building_Area: number | null; Assessed_Value: number | null; Zoning: string;
  Lot_Size: number | null; MLS_Number: string; MLS_History_Record_Count: number; Evidence_Class: string;
  Verification_Strength: string; Assessor_Source_URL: string; Qualification_Note: string;
};

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
const date = (value: unknown) => { const parsed = value ? new Date(String(value)) : null; return parsed && !Number.isNaN(parsed.valueOf()) ? parsed : null; };
const yearsSince = (value: Date | null) => value ? Math.max(0, Math.floor((Date.now() - value.valueOf()) / 31557600000)) : null;
function addressKey(value: unknown) { return text(value).split(",", 1)[0].toUpperCase().replace(/\b(STREET|AVENUE|ROAD|DRIVE|LANE|COURT|BOULEVARD|PLACE|HIGHWAY|NORTH|SOUTH|EAST|WEST)\b/g, (word) => ({STREET:"ST",AVENUE:"AVE",ROAD:"RD",DRIVE:"DR",LANE:"LN",COURT:"CT",BOULEVARD:"BLVD",PLACE:"PL",HIGHWAY:"HWY",NORTH:"N",SOUTH:"S",EAST:"E",WEST:"W"}[word] ?? word)).replace(/[^A-Z0-9]/g, ""); }

async function loadAssessor() {
  const params = new URLSearchParams({ f:"json", where:"Total_Living_Units = 6 AND GIS_Category = 'Parcel'", outFields:"Parcel_ID_URL,Parcel_Address,Owner_Name,Owner_Address,Owner_City,Owner_State,Owner_Zip,Deed_Date,YearBuilt_Min,Appraised_Total_Value,Zoning_District,Lot_Size", returnGeometry:"false" });
  const response = await fetch(`${ASSESSOR}?${params}`, { next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`Assessor service returned ${response.status}`);
  const payload = await response.json();
  return (payload.features ?? []).map((feature: { attributes: Row }) => feature.attributes) as Row[];
}

async function loadSixplexes() {
  const [spark, assessorRows] = await Promise.all([
    getSparkListings({ filter:"NumberOfUnitsTotal Eq 6", limit:1000, pagination:true, select:SELECT }),
    loadAssessor(),
  ]);
  const assessor = new Map(assessorRows.map((row) => [addressKey(row.Parcel_Address), row]));
  const groups = new Map<string, Row[]>();
  for (const item of spark.Results) {
    const row = (item.StandardFields ?? item) as Row;
    const key = `${addressKey(row.UnparsedAddress)}|${text(row.City).toUpperCase()}`;
    if (!key.startsWith("|")) groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const confirmed: SixplexProspect[] = [], review: SixplexProspect[] = [];
  for (const history of groups.values()) {
    history.sort((a,b) => text(b.ModificationTimestamp).localeCompare(text(a.ModificationTimestamp)));
    const latest = history[0];
    const parcel = text(latest.City).toUpperCase() === "ANCHORAGE" ? assessor.get(addressKey(latest.UnparsedAddress)) : undefined;
    const deed = date(parcel?.Deed_Date ? Number(parcel.Deed_Date) : null);
    const closes = history.map((row) => date(row.CloseDate)).filter((value): value is Date => Boolean(value)).sort((a,b) => b.valueOf()-a.valueOf());
    const latestClose = closes[0] ?? null;
    const reported = Math.max(...history.map((row) => Number(row.YearsCurrentOwner) || 0));
    let strength = "Low", evidence = "No MLS-recorded sale in 25 years; recorder verification required";
    if (parcel && deed && deed <= CUTOFF) { strength = "High"; evidence = "Assessor deed date indicates 25+ years; recorder verification recommended"; }
    else if (reported >= 25 && (!latestClose || latestClose <= CUTOFF)) { strength = "Medium"; evidence = "MLS reports 25+ owner years; recorder verification required"; }
    else if (latestClose && latestClose > CUTOFF) continue;
    const record: SixplexProspect = {
      Address:text(latest.UnparsedAddress)||text(parcel?.Parcel_Address), City:text(latest.City), State:text(latest.StateOrProvince)||"AK", Postal_Code:text(latest.PostalCode),
      Owner_Name:text(parcel?.Owner_Name)||text(latest.OwnerName), Owner_Mailing_Address:text(parcel?.Owner_Address), Owner_Mailing_City:text(parcel?.Owner_City), Owner_Mailing_State:text(parcel?.Owner_State), Owner_Mailing_Zip:text(parcel?.Owner_Zip),
      Assessor_Deed_Date:deed?.toISOString().slice(0,10)??"", Years_Since_Assessor_Deed:yearsSince(deed), Latest_MLS_Close_Date:latestClose?.toISOString().slice(0,10)??"",
      Latest_MLS_Status:text(latest.StandardStatus)||text(latest.MlsStatus), Latest_List_Price:num(latest.ListPrice), Latest_Close_Price:num(latest.ClosePrice), Year_Built:num(parcel?.YearBuilt_Min)??num(latest.YearBuilt), Building_Area:num(latest.BuildingAreaTotal), Assessed_Value:num(parcel?.Appraised_Total_Value), Zoning:text(parcel?.Zoning_District), Lot_Size:num(parcel?.Lot_Size), MLS_Number:text(latest.ListingId), MLS_History_Record_Count:history.length, Evidence_Class:evidence, Verification_Strength:strength, Assessor_Source_URL:text(parcel?.Parcel_ID_URL), Qualification_Note:"Prospecting label only; willingness or financial position is not established."
    };
    (strength === "High" ? confirmed : review).push(record);
  }
  confirmed.sort((a,b) => (b.Years_Since_Assessor_Deed ?? 0)-(a.Years_Since_Assessor_Deed ?? 0)); review.sort((a,b) => a.Address.localeCompare(b.Address));
  return { generatedAt:new Date().toISOString(), confirmed, review };
}

export const getSixplexData = unstable_cache(loadSixplexes, ["alaska-sixplex-prospects-v1"], { revalidate:3600, tags:["sixplexes"] });
