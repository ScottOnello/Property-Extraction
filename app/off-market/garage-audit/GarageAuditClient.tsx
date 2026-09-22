"use client";

import { useEffect, useMemo, useState } from "react";
import type { OffMarketCandidate } from "@/lib/off-market-data";

type Verdict = "garage" | "none-visible" | "unclear";
type AuditRecord = { verdict: Verdict; spaces: number | null; checkedAt: string };
type AuditData = Record<string, AuditRecord>;

const PAGE_SIZE = 6;
const STORAGE_KEY = "property-extraction-garage-visual-audit-v1";

function streetViewUrl(candidate: OffMarketCandidate, apiKey: string) {
  const location = `${candidate.latitude},${candidate.longitude}`;
  return `https://www.google.com/maps/embed/v1/streetview?${new URLSearchParams({ key: apiKey, location, pitch: "0", fov: "95" })}`;
}

function mapsUrl(candidate: OffMarketCandidate) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${candidate.address}, Anchorage, AK`)}`;
}

export default function GarageAuditClient({ candidates, apiKey, initialPage }: { candidates: OffMarketCandidate[]; apiKey: string; initialPage: number }) {
  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const page = Math.min(initialPage, pageCount);
  const shown = candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [audit, setAudit] = useState<AuditData>({});

  useEffect(() => {
    try { setAudit(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")); }
    catch { setAudit({}); }
  }, []);

  const checked = useMemo(() => Object.keys(audit).filter((parcel) => candidates.some((candidate) => candidate.parcelId === parcel)).length, [audit, candidates]);

  function save(candidate: OffMarketCandidate, verdict: Verdict, spaces: number | null = null) {
    const next = { ...audit, [candidate.parcelId]: { verdict, spaces, checkedAt: new Date().toISOString() } };
    setAudit(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function exportAudit() {
    const rows = candidates.map((candidate) => ({ parcelId: candidate.parcelId, address: candidate.address, ...(audit[candidate.parcelId] ?? { verdict: "unreviewed", spaces: null, checkedAt: "" }) }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "off-market-garage-visual-audit.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <main className="garage-audit-shell">
    <header className="garage-audit-header">
      <div><a href="/off-market">← Off-market candidates</a><p>VISUAL VERIFICATION WORKSPACE</p><h1>Garage audit</h1><span>Confirm the address label first. Count only garage doors belonging to the subject property; never count a neighboring structure.</span></div>
      <aside><strong>{checked} / {candidates.length}</strong><span>properties reviewed</span><button onClick={exportAudit}>Export audit</button></aside>
    </header>
    {!apiKey && <div className="garage-audit-warning">Google Maps is not configured for this deployment.</div>}
    <nav className="garage-audit-pages"><a className={page <= 1 ? "disabled" : ""} href={`/off-market/garage-audit?page=${page - 1}`}>← Previous</a><b>Page {page} of {pageCount}</b><a className={page >= pageCount ? "disabled" : ""} href={`/off-market/garage-audit?page=${page + 1}`}>Next →</a></nav>
    <section className="garage-audit-grid">
      {shown.map((candidate, index) => {
        const record = audit[candidate.parcelId];
        return <article className={`garage-audit-card ${record ? `is-${record.verdict}` : ""}`} key={candidate.parcelId}>
          <div className="garage-audit-title"><span>{(page - 1) * PAGE_SIZE + index + 1} of {candidates.length}</span><h2>{candidate.address}</h2><small>Parcel {candidate.parcelId}</small></div>
          {apiKey && candidate.latitude !== null && candidate.longitude !== null
            ? <iframe title={`Street View for ${candidate.address}`} src={streetViewUrl(candidate, apiKey)} loading="eager" allowFullScreen referrerPolicy="no-referrer-when-downgrade"/>
            : <div className="garage-audit-missing">Street View unavailable</div>}
          <div className="garage-audit-actions">
            <button className={record?.verdict === "garage" ? "selected" : ""} onClick={() => save(candidate, "garage", record?.spaces ?? 1)}>Garage visible</button>
            <label>Spaces <input aria-label={`Garage spaces for ${candidate.address}`} type="number" min="1" max="20" value={record?.verdict === "garage" ? record.spaces ?? 1 : 1} onChange={(event) => save(candidate, "garage", Math.max(1, Number(event.target.value) || 1))}/></label>
            <button className={record?.verdict === "none-visible" ? "selected" : ""} onClick={() => save(candidate, "none-visible", 0)}>No garage visible</button>
            <button className={record?.verdict === "unclear" ? "selected" : ""} onClick={() => save(candidate, "unclear")}>Unclear</button>
            <a href={mapsUrl(candidate)} target="_blank" rel="noreferrer">Open full Google Maps ↗</a>
          </div>
        </article>;
      })}
    </section>
    <nav className="garage-audit-pages"><a className={page <= 1 ? "disabled" : ""} href={`/off-market/garage-audit?page=${page - 1}`}>← Previous</a><b>Page {page} of {pageCount}</b><a className={page >= pageCount ? "disabled" : ""} href={`/off-market/garage-audit?page=${page + 1}`}>Next →</a></nav>
  </main>;
}
