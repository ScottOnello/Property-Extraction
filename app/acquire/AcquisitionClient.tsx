"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

export type AcquisitionCandidate = {
  parcelId: string; address: string; owner: string; yearsOwned: number | null;
  deedDate: string; zoning: string; assessedValue: number; score: number;
  yearBuilt: number | null; inTransitCorridor: boolean | null; evidenceUrl: string;
};

type GarageAudit = Record<string, { verdict?: "garage" | "none-visible" | "unclear"; spaces?: number | null; checkedAt?: string }>;
const AUDIT_KEY = "property-extraction-garage-visual-audit-v1";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const r3m = (zoning: string) => /^R[-\s]?3M(?:\b|[-\s])/i.test(zoning.trim());
const readAudit = () => localStorage.getItem(AUDIT_KEY) ?? "{}";
const subscribeAudit = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

export default function AcquisitionClient({ candidates, generatedAt }: { candidates: AcquisitionCandidate[]; generatedAt: string }) {
  const auditJson = useSyncExternalStore(subscribeAudit, readAudit, () => "{}");
  const audit = useMemo<GarageAudit>(() => {
    try { return JSON.parse(auditJson); }
    catch { return {}; }
  }, [auditJson]);
  const [zone, setZone] = useState("r3m");
  const [garage, setGarage] = useState("all");
  const [street, setStreet] = useState("quiet");
  const [search, setSearch] = useState("");

  const scoped = useMemo(() => candidates.filter((candidate) => {
    if (zone === "r3m" && !r3m(candidate.zoning)) return false;
    if (street === "quiet" && candidate.inTransitCorridor !== false) return false;
    if (garage === "visible" && audit[candidate.parcelId]?.verdict !== "garage") return false;
    if (garage === "review" && audit[candidate.parcelId]?.verdict === "garage") return false;
    return !search || `${candidate.address} ${candidate.parcelId}`.toLowerCase().includes(search.toLowerCase());
  }), [candidates, zone, street, garage, audit, search]);
  const visible = scoped.filter((candidate) => audit[candidate.parcelId]?.verdict === "garage");
  const needsReview = scoped.filter((candidate) => audit[candidate.parcelId]?.verdict !== "garage");
  const ordered = [...visible, ...needsReview].sort((a, b) => {
    const aConfirmed = audit[a.parcelId]?.verdict === "garage" ? 1 : 0;
    const bConfirmed = audit[b.parcelId]?.verdict === "garage" ? 1 : 0;
    return bConfirmed - aConfirmed || b.score - a.score || (b.yearsOwned ?? 0) - (a.yearsOwned ?? 0);
  });
  const zoneCount = candidates.filter((candidate) => r3m(candidate.zoning)).length;

  return <div className="app-shell"><aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a href="/browse">Browse deals</a><a className="active" href="/acquire">Fourplex acquisition</a><a href="/">Fourplex prospects</a><a href="/off-market">Off-market candidates</a><a href="/off-market/garage-audit">Visual garage audit</a><a href="/garages">Garage deals</a><a href="/analyze">Buy Lab</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="workspace acquire-workspace">
      <header><div><p className="eyebrow">ANCHORAGE · EXISTING FOURPLEXES</p><h1>Fourplex acquisition</h1><p className="muted">Long-held, apparently off-market four-unit properties. Confirm garage spaces and title before outreach or an offer.</p></div></header>
      <div className="acquire-stats"><div><strong>{candidates.length}</strong><span>25+ year apparent holds</span></div><div><strong>{zoneCount}</strong><span>R-3M zoning records</span></div><div><strong>{candidates.filter((candidate) => audit[candidate.parcelId]?.verdict === "garage").length}</strong><span>Garage marked visible in this browser</span></div></div>
      <div className="acquire-filter" aria-label="Fourplex acquisition filters">
        <label>Zoning<select value={zone} onChange={(event) => setZone(event.target.value)}><option value="r3m">R-3M only</option><option value="all">All zoning</option></select></label>
        <label>Garage evidence<select value={garage} onChange={(event) => setGarage(event.target.value)}><option value="all">Confirmed + needs review</option><option value="visible">Marked visible only</option><option value="review">Needs garage review</option></select></label>
        <label>Street screen<select value={street} onChange={(event) => setStreet(event.target.value)}><option value="quiet">Outside mapped corridors</option><option value="all">All streets</option></select></label>
        <label>Find address<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Address or parcel ID"/></label>
      </div>
      <div className="acquire-toolbar"><span><b>{ordered.length}</b> candidates · {visible.length} garage marked visible</span><a href="/off-market/garage-audit">Verify garages →</a></div>
      <section className="acquire-list" aria-label="Fourplex acquisition candidates">
        {ordered.slice(0, 100).map((candidate) => {
          const record = audit[candidate.parcelId];
          const confirmed = record?.verdict === "garage";
          return <article className="acquire-card" key={candidate.parcelId}>
            <div className="acquire-main"><span className={confirmed ? "acquire-badge confirmed" : "acquire-badge"}>{confirmed ? `${record.spaces ?? "?"} garage space${record.spaces === 1 ? "" : "s"} marked visible` : record?.verdict === "none-visible" ? "No garage visible in audit" : "Garage not confirmed"}</span><h2>{candidate.address}</h2><p>Parcel {candidate.parcelId} · {candidate.zoning || "Zoning not reported"} · built {candidate.yearBuilt ?? "unknown"}</p></div>
            <div className="acquire-details"><span><b>{candidate.yearsOwned ?? "—"}</b> apparent years held</span><span><b>{money.format(candidate.assessedValue)}</b> assessment</span><span><b>{candidate.inTransitCorridor === false ? "Outside" : candidate.inTransitCorridor === true ? "Near" : "Unknown"}</b> mapped corridor</span></div>
            <div className="acquire-links"><a className="acquire-primary" href={`/analyze?parcel=${encodeURIComponent(candidate.parcelId)}`}>Open Buy Lab →</a>{candidate.evidenceUrl && <a href={candidate.evidenceUrl} target="_blank" rel="noreferrer">Municipal record ↗</a>}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${candidate.address}, Anchorage, AK`)}`} target="_blank" rel="noreferrer">Check location ↗</a></div>
          </article>;
        })}
        {!ordered.length && <div className="acquire-empty"><h2>No candidates match these filters</h2><p>{zone === "r3m" ? "Try All zoning to see other long-held fourplexes." : "Try All streets or broaden the garage evidence filter."}</p></div>}
      </section>
      {ordered.length > 100 && <p className="acquire-footnote">Showing the first 100 candidates. Narrow the filters to focus the list.</p>}
      <p className="acquire-footnote">“Tired landlord” is a prospecting shorthand for an apparent 25+ year hold, not evidence of financial condition or willingness to sell. Garage-visible ratings come from this browser’s manual Street View audit, not a permit or site inspection. R-3M is the municipal parcel label, not a determination of permitted use. Active MLS address matches are excluded by a screening match, which may miss listings. Deed history, zoning, garage count, and market status require independent verification. Data refreshed {new Date(generatedAt).toLocaleDateString("en-US", { timeZone: "America/Anchorage" })}.</p>
    </main>
  </div>;
}
