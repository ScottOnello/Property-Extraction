"use client";

import { useMemo, useState } from "react";
import "./sixplexes.css";

type Prospect = {
  Address: string;
  City: string;
  State: string;
  Postal_Code: string;
  Owner_Name: string;
  Owner_Mailing_Address: string;
  Owner_Mailing_City: string;
  Owner_Mailing_State: string;
  Owner_Mailing_Zip: string;
  Assessor_Deed_Date: string;
  Years_Since_Assessor_Deed: number | null;
  Latest_MLS_Close_Date: string;
  Latest_MLS_Status: string;
  Latest_List_Price: number | null;
  Latest_Close_Price: number | null;
  Year_Built: number | null;
  Building_Area: number | null;
  Assessed_Value: number | null;
  Zoning: string;
  Lot_Size: number | null;
  MLS_Number: string;
  MLS_History_Record_Count: number;
  Evidence_Class: string;
  Verification_Strength: string;
  Assessor_Source_URL: string;
  Qualification_Note: string;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US");

export default function SixplexClient({ generatedAt, confirmed, review }: { generatedAt: string; confirmed: Prospect[]; review: Prospect[] }) {
  const [query, setQuery] = useState("");
  const [evidence, setEvidence] = useState<"all" | "confirmed" | "review">("all");
  const [selected, setSelected] = useState<Prospect | null>(null);
  const all = useMemo(() => [...confirmed, ...review], [confirmed, review]);
  const filtered = useMemo(() => {
    const pool = evidence === "confirmed" ? confirmed : evidence === "review" ? review : all;
    const needle = query.trim().toLowerCase();
    return needle ? pool.filter((p) => `${p.Address} ${p.Owner_Name} ${p.MLS_Number}`.toLowerCase().includes(needle)) : pool;
  }, [all, confirmed, evidence, query, review]);
  const listed = all.filter((p) => p.Latest_MLS_Status.toLowerCase() === "active").length;
  const value = all.reduce((sum, p) => sum + (p.Assessed_Value ?? 0), 0);

  return <div className="six-shell">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a href="/">Fourplex prospects</a><a className="active" href="/sixplexes">Sixplex prospects</a><a href="/rankings">Deal rankings</a><a href="/analyze">Buy Lab</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="six-workspace">
      <header className="six-header"><div><p className="eyebrow">ALASKA MLS + PUBLIC RECORDS</p><h1>Sixplex acquisition board</h1><p className="muted">Long-held six-unit properties, separated by evidence strength.</p></div><div className="evidence-key"><span><i className="dot confirmed"/>Assessor-supported</span><span><i className="dot review"/>Recorder check needed</span><small>Refreshed {new Date(generatedAt).toLocaleDateString("en-US", { timeZone: "America/Anchorage", month: "short", day: "numeric", year: "numeric" })}</small></div></header>
      <section className="six-metrics"><article className="metric-primary"><span>Prospects</span><strong>{all.length}</strong><em>Six-unit properties</em></article><article><span>Assessor-supported</span><strong>{confirmed.length}</strong><em>25+ year deed date</em></article><article><span>Recorder review</span><strong>{review.length}</strong><em>Not yet deed-chain verified</em></article><article><span>Active listings</span><strong>{listed}</strong><em>Latest MLS status</em></article><article><span>Known assessed value</span><strong>{money.format(value)}</strong><em>Available assessor records</em></article></section>
      <section className="six-panel">
        <div className="six-toolbar"><div><h2>Prospect ledger</h2><p>{filtered.length} records shown</p></div><div className="six-filters"><input aria-label="Search prospects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search address, owner, MLS…"/><select aria-label="Evidence filter" value={evidence} onChange={(event) => setEvidence(event.target.value as typeof evidence)}><option value="all">All evidence</option><option value="confirmed">Assessor-supported</option><option value="review">Recorder check needed</option></select></div></div>
        <div className="six-table-wrap"><table><thead><tr><th>Evidence</th><th>Property</th><th>Owner</th><th>Deed signal</th><th>Latest MLS</th><th>Value</th></tr></thead><tbody>{filtered.map((p) => <tr key={`${p.Address}-${p.MLS_Number}`} onClick={() => setSelected(p)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelected(p); }}><td><span className={`status ${p.Verification_Strength === "High" ? "status-high" : "status-review"}`}>{p.Verification_Strength === "High" ? "Supported" : "Review"}</span></td><td><b>{p.Address}</b><small>MLS {p.MLS_Number || "—"} · {p.Year_Built ? `Built ${p.Year_Built}` : "Year unknown"}</small></td><td>{p.Owner_Name || "Owner unavailable"}<small>{[p.Owner_Mailing_City, p.Owner_Mailing_State].filter(Boolean).join(", ") || "Mailing address unavailable"}</small></td><td>{p.Assessor_Deed_Date || "No assessor deed date"}<small>{p.Years_Since_Assessor_Deed ? `${p.Years_Since_Assessor_Deed} years indicated` : "Recorder verification required"}</small></td><td>{p.Latest_MLS_Status || "Unknown"}<small>{p.Latest_List_Price ? money.format(p.Latest_List_Price) : "No current price"}</small></td><td>{p.Assessed_Value ? money.format(p.Assessed_Value) : "—"}<small>{p.Building_Area ? `${number.format(p.Building_Area)} sq ft` : "Area unavailable"}</small></td></tr>)}</tbody></table></div>
        {!filtered.length && <div className="six-empty"><h3>No prospects match</h3><p>Try a broader search or a different evidence filter.</p></div>}
        <p className="six-note">“Tired landlord” is a prospecting label only. It does not establish financial position, motivation, or willingness to sell. Confirm the full deed chain before outreach or acquisition decisions.</p>
      </section>
    </main>
    {selected && <div className="six-overlay" onClick={() => setSelected(null)}><aside className="six-detail" onClick={(event) => event.stopPropagation()}><button className="detail-close" aria-label="Close property details" onClick={() => setSelected(null)}>×</button><p className="eyebrow">SIXPLEX RECORD</p><h2>{selected.Address}</h2><span className={`status ${selected.Verification_Strength === "High" ? "status-high" : "status-review"}`}>{selected.Verification_Strength === "High" ? "Assessor-supported" : "Recorder check needed"}</span><dl><dt>Owner shown</dt><dd>{selected.Owner_Name || "Unavailable"}</dd><dt>Owner mailing address</dt><dd>{[selected.Owner_Mailing_Address, selected.Owner_Mailing_City, selected.Owner_Mailing_State, selected.Owner_Mailing_Zip].filter(Boolean).join(", ") || "Unavailable"}</dd><dt>Deed signal</dt><dd>{selected.Assessor_Deed_Date || "No assessor date"}{selected.Years_Since_Assessor_Deed ? ` · ${selected.Years_Since_Assessor_Deed} years` : ""}</dd><dt>Evidence status</dt><dd>{selected.Evidence_Class}</dd><dt>Latest MLS record</dt><dd>{selected.Latest_MLS_Status || "Unknown"}{selected.Latest_List_Price ? ` · ${money.format(selected.Latest_List_Price)}` : ""}</dd><dt>Property facts</dt><dd>{selected.Year_Built ? `Built ${selected.Year_Built}` : "Year unknown"} · {selected.Building_Area ? `${number.format(selected.Building_Area)} sq ft` : "Area unknown"} · {selected.Zoning || "Zoning unknown"}</dd></dl><div className="detail-actions">{selected.Assessor_Source_URL && <a href={selected.Assessor_Source_URL} target="_blank" rel="noreferrer">Open assessor record ↗</a>}<a href={`/analyze`}>Open Buy Lab →</a></div><p className="detail-warning">{selected.Qualification_Note}</p></aside></div>}
  </div>;
}
