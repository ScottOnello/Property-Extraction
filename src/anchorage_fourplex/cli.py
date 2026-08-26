from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from .prospector import BASE_WHERE, LAYER_URL, SCORING_VERSION, SOURCE_MAP_URL, download_fourplexes, prepare_records, write_csv, write_summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Download and rank Municipality of Anchorage fourplex parcels.")
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/latest"))
    parser.add_argument("--minimum-years-owned", type=int, default=20)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    parser.add_argument("--timeout", type=float, default=60)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.minimum_years_owned < 0:
        raise SystemExit("--minimum-years-owned must be zero or greater")
    result = download_fourplexes(timeout=args.timeout)
    all_records, prospects = prepare_records(result.records, args.as_of, args.minimum_years_owned)
    write_csv(args.output_dir / "all_fourplexes.csv", all_records)
    write_csv(args.output_dir / "fourplex_prospects.csv", prospects)
    write_summary(args.output_dir / "run_summary.json", {
        "all_fourplex_records": len(all_records), "prospect_records": len(prospects),
        "minimum_years_owned": args.minimum_years_owned, "as_of": args.as_of.isoformat(),
        "retrieved_at_utc": result.retrieved_at, "base_query": BASE_WHERE,
        "source_layer_url": LAYER_URL, "source_map_url": SOURCE_MAP_URL,
        "scoring_version": SCORING_VERSION,
        "disclaimer": "Opportunity scores are screening indicators derived from public assessment data, not factual claims about an owner or property. Verify deed history independently.",
    })
    print(f"Downloaded {len(all_records):,} fourplex records.")
    print(f"Wrote {len(prospects):,} prospects to {args.output_dir.resolve()}.")
    return 0
