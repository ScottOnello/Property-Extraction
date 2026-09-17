"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OffMarketCandidate, OffMarketData } from "@/lib/off-market-data";

type LeafletMap = {
  fitBounds: (bounds: Array<[number, number]>, options?: { padding?: [number, number]; maxZoom?: number }) => void;
  setView: (center: [number, number], zoom: number) => void;
  remove: () => void;
};
type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer };
type LeafletCircle = LeafletLayer & { addTo: (map: LeafletMap) => LeafletCircle; bindPopup: (content: string) => LeafletCircle };
type LeafletNamespace = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options: Record<string, string | number>) => LeafletLayer;
  circleMarker: (point: [number, number], options: Record<string, string | number | boolean>) => LeafletCircle;
};

declare global { interface Window { L?: LeafletNamespace } }

const LEAFLET_SCRIPT_ID = "off-market-leaflet-script";
const LEAFLET_STYLE_ID = "off-market-leaflet-style";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US");

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise<LeafletNamespace>((resolve, reject) => {
    let style = document.getElementById(LEAFLET_STYLE_ID) as HTMLLinkElement | null;
    if (!style) {
      style = document.createElement("link");
      style.id = LEAFLET_STYLE_ID;
      style.rel = "stylesheet";
      style.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      style.integrity = "sha256-p4NxAoJBhIINfQfQFqeo6aX48F1UluRI+6oJ5B9nqP8=";
      style.crossOrigin = "";
      document.head.appendChild(style);
    }
    const ready = () => window.L ? resolve(window.L) : reject(new Error("The map library did not load."));
    const existing = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", ready, { once: true });
      existing.addEventListener("error", () => reject(new Error("The map library could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.async = true;
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => reject(new Error("The map library could not be loaded.")), { once: true });
    document.head.appendChild(script);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function mapPopup(candidate: OffMarketCandidate) {
  const held = candidate.yearsOwned === null ? "Deed duration unavailable" : `${candidate.yearsOwned} years held (apparent)`;
  return `<div class="off-map-popup">
    <span class="off-popup-tier off-popup-${candidate.screeningTier.toLowerCase()}">${candidate.screeningTier}</span>
    <strong>${escapeHtml(candidate.address)}</strong>
    <span>${escapeHtml(candidate.owner)}</span>
    <span>${escapeHtml(held)} · score ${candidate.score}/100</span>
    <a href="/analyze?parcel=${encodeURIComponent(candidate.parcelId)}">Open Buy Lab →</a>
  </div>`;
}

function mapStyle(tier: OffMarketCandidate["screeningTier"]) {
  if (tier === "Priority") return { color: "#056f57", fillColor: "#14a87d", radius: 7 };
  if (tier === "Potential") return { color: "#a26912", fillColor: "#e5a839", radius: 5.5 };
  return { color: "#57717a", fillColor: "#8ca1a6", radius: 4.5 };
}

function CandidateMap({ candidates }: { candidates: OffMarketCandidate[] }) {
  const element = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState(false);
  const mappedCandidates = useMemo(() => candidates.filter((candidate) => candidate.latitude !== null && candidate.longitude !== null), [candidates]);

  useEffect(() => {
    const target = element.current;
    if (!target || !mappedCandidates.length) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    loadLeaflet().then((L) => {
      if (cancelled) return;
      map = L.map(target, { scrollWheelZoom: false, preferCanvas: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      const bounds: Array<[number, number]> = [];
      for (const candidate of mappedCandidates) {
        const point: [number, number] = [candidate.latitude!, candidate.longitude!];
        bounds.push(point);
        const style = mapStyle(candidate.screeningTier);
        const marker = L.circleMarker(point, { ...style, weight: 1.5, fillOpacity: .9 });
        marker.addTo(map);
        marker.bindPopup(mapPopup(candidate));
      }
      if (bounds.length === 1) map.setView(bounds[0], 13);
      else map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
    }).catch(() => setMapError(true));
    return () => { cancelled = true; map?.remove(); };
  }, [mappedCandidates]);

  return <div className="off-map-wrap">
    <div ref={element} className="off-map" aria-label="Interactive map of off-market screening candidates"/>
    <aside className="off-map-overlay" aria-label="Map legend">
      <p>Map-first screening</p>
      <strong>{mappedCandidates.length.toLocaleString()} candidates shown</strong>
      <span><i className="off-dot priority"/> Priority</span><span><i className="off-dot potential"/> Potential</span><span><i className="off-dot review"/> Review</span>
      <small>Select a pin for the public-record signals and a Buy Lab link.</small>
    </aside>
    {mapError && <p className="off-map-message">Map tiles are temporarily unavailable. The candidate queue is still available below.</p>}
  </div>;
}

export default function OffMarketClient({ candidates, generatedAt, municipalFetchedAt, longHeldProperties, activeListingRows, activeAddressMatchesExcluded }: OffMarketData) {
  const [query, setQuery] = useState("");
  const [holdPeriod, setHoldPeriod] = useState<20 | 25 | 35>(20);
  const [signal, setSignal] = useState<"all" | "priority" | "absentee" | "out-of-state">("all");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const matchesSearch = !needle || `${candidate.address} ${candidate.owner} ${candidate.parcelId}`.toLowerCase().includes(needle);
      const matchesHold = (candidate.yearsOwned ?? 0) >= holdPeriod;
      const matchesSignal = signal === "all"
        || signal === "priority" && candidate.screeningTier === "Priority"
        || signal === "absentee" && candidate.absentee
        || signal === "out-of-state" && candidate.outOfState;
      return matchesSearch && matchesHold && matchesSignal;
    });
  }, [candidates, holdPeriod, query, signal]);
  const mappedCount = filtered.filter((candidate) => candidate.latitude !== null && candidate.longitude !== null).length;
  const priorityCount = filtered.filter((candidate) => candidate.screeningTier === "Priority").length;

  return <div className="off-shell">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a href="/">Fourplex prospects</a><a className="active" href="/off-market">Off-market candidates</a><a href="/sixplexes">Sixplex prospects</a><a href="/garages">Garage deals</a><a href="/rankings">Deal rankings</a><a href="/analyze">Buy Lab</a><a href="#method">Screening method</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="off-workspace">
      <header className="off-header"><div><p className="eyebrow">PUBLIC RECORDS + CONNECTED ALASKA MLS</p><h1>Off‑Market Candidates</h1><p className="muted">A quick, map-first queue of long-held Anchorage fourplexes that did not exactly match an active four-unit listing in the connected MLS snapshot.</p></div><div className="off-source"><span><i/> Screening data refreshed</span><small>{new Date(generatedAt).toLocaleString("en-US", { timeZone: "America/Anchorage", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} AK time</small></div></header>

      <section className="off-caveat"><b>Important:</b> “Off-market candidate” is a screening label, not a claim that an owner is selling or that the property is unavailable on every marketplace. Verify the current MLS status, title/deed chain, owner contact details, and interest before outreach.</section>

      <section className="off-metrics"><article className="off-primary"><span>Candidate queue</span><strong>{candidates.length.toLocaleString()}</strong><em>20+ apparent years held</em></article><article><span>Priority tier</span><strong>{candidates.filter((candidate) => candidate.screeningTier === "Priority").length.toLocaleString()}</strong><em>25+ years + score 60+</em></article><article><span>Active MLS matches removed</span><strong>{activeAddressMatchesExcluded.toLocaleString()}</strong><em>Exact address matches only</em></article><article><span>Map locations</span><strong>{candidates.filter((candidate) => candidate.latitude !== null && candidate.longitude !== null).length.toLocaleString()}</strong><em>Municipal parcel geometry</em></article></section>

      <section className="off-panel off-filters-panel"><div><p className="eyebrow">FAST FILTERS</p><h2>Find the next deal to investigate</h2></div><div className="off-filters"><input aria-label="Search candidates" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search address, owner, parcel…"/><select aria-label="Minimum apparent holding period" value={holdPeriod} onChange={(event) => setHoldPeriod(Number(event.target.value) as typeof holdPeriod)}><option value={20}>20+ years held</option><option value={25}>25+ years held</option><option value={35}>35+ years held</option></select><select aria-label="Signal filter" value={signal} onChange={(event) => setSignal(event.target.value as typeof signal)}><option value="all">All signals</option><option value="priority">Priority tier</option><option value="absentee">Absentee mailing</option><option value="out-of-state">Out-of-state owner</option></select></div><div className="off-filter-summary"><b>{filtered.length.toLocaleString()}</b> candidates match · <b>{priorityCount.toLocaleString()}</b> priority · <b>{mappedCount.toLocaleString()}</b> on the map</div></section>

      {filtered.length ? <CandidateMap candidates={filtered}/> : <section className="off-empty"><h2>No candidates match these filters</h2><p>Broaden the holding-period or signal filter to restore the queue.</p></section>}

      <section className="off-panel off-queue"><div className="off-queue-toolbar"><div><p className="eyebrow">INVESTIGATION QUEUE</p><h2>Open only the deals worth underwriting</h2><p>Sorted by screening tier, public-record score, and apparent years held.</p></div><span>{filtered.length > 100 ? "Showing first 100" : `${filtered.length} candidates`}</span></div><div className="off-table-wrap"><table><thead><tr><th>Tier</th><th>Property</th><th>Apparent hold</th><th>Public-record signals</th><th>Owner mailing</th><th>Property facts</th><th/></tr></thead><tbody>{filtered.slice(0, 100).map((candidate) => <tr key={candidate.parcelId}><td><span className={`off-tier off-tier-${candidate.screeningTier.toLowerCase()}`}>{candidate.screeningTier}</span><small>Score {candidate.score}/100</small></td><td><b>{candidate.address}</b><small>Parcel {candidate.parcelId} · {candidate.locationTier}</small></td><td><b>{candidate.yearsOwned ?? "—"}{candidate.yearsOwned === null ? "" : " years"}</b><small>{candidate.deedDate || "No municipal deed date"}</small></td><td><div className="off-signals">{candidate.reasons.slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}</div></td><td>{candidate.owner}<small>{[candidate.ownerCity, candidate.ownerState].filter(Boolean).join(", ") || "Mailing location unavailable"}</small></td><td>{candidate.yearBuilt ? `Built ${candidate.yearBuilt}` : "Year unavailable"}<small>{candidate.assessedValue ? money.format(candidate.assessedValue) : "Value unavailable"} · {candidate.locationScore}/100 location</small></td><td><a className="off-analyze" href={`/analyze?parcel=${candidate.parcelId}`}>Buy Lab →</a></td></tr>)}</tbody></table></div><p className="off-note">Public-record facts come from the Municipality of Anchorage parcel layer (refreshed {new Date(municipalFetchedAt).toLocaleDateString("en-US", { timeZone: "America/Anchorage", month: "short", day: "numeric", year: "numeric" })}). The MLS comparison examined {number.format(activeListingRows)} active four-unit feed records and removes only exact normalized address matches; it can miss an active listing with a materially different address format.</p></section>

      <section id="method" className="off-method"><div><p className="eyebrow">AUDITABLE SCREEN</p><h2>What the badge means—and what it does not</h2><p>Priority is not a prediction of seller motivation. It simply combines a longer apparent hold period with visible public-record signals so you can decide where to spend verification time.</p></div><dl><dt>Included</dt><dd>Municipal fourplex records with an apparent 20+ year hold; ownership, mailing, age, portfolio, location, and assessed-value context.</dd><dt>Removed</dt><dd>Properties whose normalized municipal address exactly matched an active four-unit listing in the connected Alaska MLS snapshot.</dd><dt>Still verify</dt><dd>Listing status, ownership, full deed chain, condition, rents, contact permissions, and willingness to sell.</dd></dl></section>
    </main>
  </div>;
}
