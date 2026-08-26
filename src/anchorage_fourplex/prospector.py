from __future__ import annotations

import csv
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

LAYER_URL = "https://services2.arcgis.com/Ce3DhLRthdwbHlfF/arcgis/rest/services/PropertyInformation_Hosted/FeatureServer/0"
QUERY_URL = f"{LAYER_URL}/query"
SOURCE_MAP_URL = "https://experience.arcgis.com/experience/3fab5d36349c451aa40402838530d1d4"
BASE_WHERE = "Total_Living_Units = 4 AND GIS_Category = 'Parcel'"
SCORING_VERSION = "1.0"
FIELDS = [
    "OBJECTID", "Parcel_ID", "Parcel_ID_URL", "Parcel_Address", "Property_Type",
    "Class", "Land_Use", "Total_Living_Units", "Owner_Name", "Owner_Address",
    "Owner_City", "Owner_State", "Owner_Zip", "Deed_Date", "YearBuilt_Min",
    "YearBuilt_Max", "Appraisal_Year", "Appraised_Land_Value",
    "Appraised_Building_Value", "Appraised_Total_Value", "Taxable_Value",
    "Total_Exemptions", "Zoning_District", "Lot_Size", "GIS_Category", "PUBDATE",
]
ENTITY_TERMS = re.compile(
    r"\b(LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|CO\.?|LP|LLP|LTD|PARTNERSHIP|ASSOCIATION|ASSOC|FOUNDATION|AUTHORITY|BOROUGH|MUNICIPALITY|CITY OF|STATE OF|USA|UNITED STATES|HOUSING FINANCE)\b",
    re.IGNORECASE,
)
INDIVIDUAL_SPECIAL_TERMS = re.compile(r"\b(TRUST|TRUSTEE|ESTATE|HEIRS?)\b", re.IGNORECASE)
ADDRESS_NOISE = re.compile(r"[^A-Z0-9]+")


@dataclass(frozen=True)
class DownloadResult:
    records: list[dict[str, Any]]
    requested_ids: int
    retrieved_at: str


class ArcGISError(RuntimeError):
    pass


def _request_json(params: dict[str, Any], timeout: float, attempts: int = 4) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{QUERY_URL}?{urllib.parse.urlencode(params)}",
        headers={"User-Agent": "AnchorageFourplexProspector/0.1 (+public-record-research)"},
    )
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            if "error" in payload:
                raise ArcGISError(json.dumps(payload["error"], sort_keys=True))
            return payload
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ArcGISError) as exc:
            last_error = exc
            if attempt + 1 == attempts:
                break
            time.sleep(1.5 * (2**attempt))
    raise ArcGISError(f"ArcGIS request failed after {attempts} attempts: {last_error}")


def download_fourplexes(timeout: float = 60, chunk_size: int = 100) -> DownloadResult:
    id_payload = _request_json({"f": "json", "where": BASE_WHERE, "returnIdsOnly": "true"}, timeout)
    object_ids = sorted(id_payload.get("objectIds") or [])
    if not object_ids:
        raise ArcGISError("The service returned no fourplex object IDs.")
    records: list[dict[str, Any]] = []
    for start in range(0, len(object_ids), chunk_size):
        chunk = object_ids[start:start + chunk_size]
        payload = _request_json({
            "f": "json", "objectIds": ",".join(str(value) for value in chunk),
            "outFields": ",".join(FIELDS), "returnGeometry": "false",
            "orderByFields": "OBJECTID ASC",
        }, timeout)
        records.extend(feature.get("attributes", {}) for feature in (payload.get("features") or []))
    if len(records) != len(object_ids):
        raise ArcGISError(f"Completeness check failed: requested {len(object_ids)} IDs but received {len(records)} records.")
    return DownloadResult(records, len(object_ids), datetime.now(timezone.utc).isoformat())


def epoch_millis_to_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).date()
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def years_owned(deed_date: date | None, as_of: date) -> int | None:
    if deed_date is None or deed_date > as_of:
        return None
    years = as_of.year - deed_date.year
    return years - ((as_of.month, as_of.day) < (deed_date.month, deed_date.day))


def normalize_address(value: Any) -> str:
    text = f" {str(value or '').upper()} "
    replacements = {" STREET ": " ST ", " AVENUE ": " AVE ", " ROAD ": " RD ", " DRIVE ": " DR ", " LANE ": " LN ", " COURT ": " CT ", " BOULEVARD ": " BLVD ", " PLACE ": " PL ", " HIGHWAY ": " HWY "}
    for source, target in replacements.items():
        text = text.replace(source, target)
    return ADDRESS_NOISE.sub("", text)


def owner_type(owner_name: Any) -> str:
    name = str(owner_name or "").strip()
    if not name:
        return "unknown"
    if INDIVIDUAL_SPECIAL_TERMS.search(name):
        return "individual_or_estate"
    if ENTITY_TERMS.search(name):
        return "entity_or_government"
    return "individual_or_estate"


def score_record(record: dict[str, Any], as_of: date) -> dict[str, Any]:
    result = dict(record)
    deed_date = epoch_millis_to_date(record.get("Deed_Date"))
    owned = years_owned(deed_date, as_of)
    property_address = normalize_address(record.get("Parcel_Address"))
    mailing_address = normalize_address(record.get("Owner_Address"))
    absentee = bool(property_address and mailing_address and property_address != mailing_address)
    out_of_state = bool(record.get("Owner_State")) and str(record["Owner_State"]).strip().upper() != "AK"
    classification = owner_type(record.get("Owner_Name"))
    score = 0
    reasons: list[str] = []
    if owned is not None:
        if owned >= 35:
            score += 40; reasons.append("owned 35+ years (+40)")
        elif owned >= 25:
            score += 30; reasons.append("owned 25–34 years (+30)")
        elif owned >= 20:
            score += 20; reasons.append("owned 20–24 years (+20)")
    if absentee:
        score += 15; reasons.append("mailing address differs (+15)")
    if out_of_state:
        score += 20; reasons.append("out-of-state mailing address (+20)")
    if classification == "individual_or_estate":
        score += 10; reasons.append("individual/estate/trust owner (+10)")
    built = record.get("YearBuilt_Min")
    if isinstance(built, (int, float)):
        if built <= 1979:
            score += 15; reasons.append("built 1979 or earlier (+15)")
        elif built <= 1989:
            score += 10; reasons.append("built 1980–1989 (+10)")
        elif built <= 1999:
            score += 5; reasons.append("built 1990–1999 (+5)")
    flags: list[str] = []
    if deed_date is None: flags.append("missing_or_invalid_deed_date")
    if not record.get("Parcel_Address"): flags.append("missing_property_address")
    if not record.get("Owner_Address"): flags.append("missing_owner_mailing_address")
    if not built: flags.append("missing_year_built")
    result.update({
        "Deed_Date": deed_date.isoformat() if deed_date else "",
        "Years_Owned": owned if owned is not None else "",
        "Absentee_Indicator": absentee,
        "Out_Of_State_Indicator": out_of_state,
        "Owner_Type": classification,
        "Opportunity_Score": score,
        "Score_Reasons": "; ".join(reasons),
        "Data_Quality_Flags": "; ".join(flags),
        "Evidence_URL": record.get("Parcel_ID_URL") or LAYER_URL,
    })
    return result


def prepare_records(records: Iterable[dict[str, Any]], as_of: date, minimum_years_owned: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    scored = [score_record(record, as_of) for record in records]
    all_records = sorted(scored, key=lambda row: (str(row.get("Parcel_Address") or ""), str(row.get("Parcel_ID") or "")))
    prospects = [row for row in scored if isinstance(row.get("Years_Owned"), int) and row["Years_Owned"] >= minimum_years_owned]
    prospects.sort(key=lambda row: (-int(row["Opportunity_Score"]), -int(row["Years_Owned"]), str(row.get("Parcel_Address") or "")))
    return all_records, prospects


OUTPUT_FIELDS = [
    "Opportunity_Score", "Score_Reasons", "Parcel_Address", "Parcel_ID",
    "Total_Living_Units", "Owner_Name", "Owner_Type", "Owner_Address",
    "Owner_City", "Owner_State", "Owner_Zip", "Absentee_Indicator",
    "Out_Of_State_Indicator", "Deed_Date", "Years_Owned", "YearBuilt_Min",
    "YearBuilt_Max", "Property_Type", "Class", "Land_Use", "Zoning_District",
    "Lot_Size", "Appraisal_Year", "Appraised_Land_Value",
    "Appraised_Building_Value", "Appraised_Total_Value", "Taxable_Value",
    "Total_Exemptions", "Data_Quality_Flags", "Evidence_URL",
]


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_summary(path: Path, summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
