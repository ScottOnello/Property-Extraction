import { getPropertyData } from "@/lib/data";
import "./browse/browse.css";
import "./home-browse.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; score?: string; parcel?: string }> }) {
  const query = await searchParams;
  const { properties, portfolios, fetchedAt } = await getPropertyData();
  const view = query.view === "owners" ? "owners" : "properties";
  const search = (query.q ?? "").trim().toLowerCase();
  const minimumScore = Math.max(0, Math.min(100, Number(query.score) || 20));
  const prospects = properties.filter((property) => (property.yearsOwned ?? 0) >= 20 && property.score >= minimumScore && (!search || `${property.address} ${property.owner} ${property.parcelId}`.toLowerCase().includes(search)));
  const owners = portfolios.filter((owner) => owner.score >= minimumScore && (!search || `${owner.owner} ${owner.addresses.join(" ")}`.toLowerCase().includes(search)));
  const selected = query.parcel ? properties.find((property) => property.parcelId === query.parcel) : undefined;
  return <div className="app-shell">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div>
      <nav><a href="/browse">Browse deals</a><a className={view === "properties" ? "active" : ""} href="/?view=properties">Fourplex prospects</a><a href="/off-market">Off-market candidates</a><a href="/sixplexes">Sixplex prospects</a><a href="/garages">Garage deals</a><a className={view === "owners" ? "active" : ""} href="/?view=owners">Owner portfolios</a><a href="/rankings">Deal rankings</a><a href="/analyze">Buy Lab</a><a href="/flexmls">Flexmls</a><a href="/#method">Scoring method</a></nav></div>
      <form action="/api/logout" method="post"><button className="logout">Sign out</button></form>
    </aside>
    <main className="workspace">
      <header><div><p className="eyebrow">MUNICIPALITY OF ANCHORAGE · FOURPLEX INTELLIGENCE</p><h1>Acquisition dashboard</h1><p className="muted">Prioritize long-held properties with transparent, public-record signals.</p></div><div className="live"><i/> Live municipal data<br/><small>Updated {new Date(fetchedAt).toLocaleString("en-US", { timeZone: "America/Anchorage" })} AKDT</small></div></header>
      <form className="browse-ribbon home-browse-ribbon" aria-label="Filter Anchorage deals" action="/browse">
        <label>Bedrooms<select name="beds" defaultValue="0"><option value="0">Any beds</option>{[1,2,3,4,5,6,8,10].map((value) => <option key={value} value={value}>{value}+ beds</option>)}</select></label>
        <label>Bathrooms<select name="baths" defaultValue="0"><option value="0">Any baths</option>{[1,2,3,4,5,6,8,10].map((value) => <option key={value} value={value}>{value}+ baths</option>)}</select></label>
        <label>Property<select name="type" defaultValue="all"><option value="all">All property types</option><option value="investment">Investment · 2+ units</option><option value="fourplex">Fourplex · 4 units</option><option value="fiveplus">5+ units</option><option value="single">Single unit</option></select></label>
        <button type="submit">Browse Anchorage deals →</button>
      </form>
      <section className="metrics"><article><span>Fourplex parcels</span><strong>{properties.length.toLocaleString()}</strong><em>Complete public layer</em></article><article><span>20+ year prospects</span><strong>{properties.filter((p) => (p.yearsOwned ?? 0) >= 20).length}</strong><em>Apparent deed duration</em></article><article><span>Owner groups</span><strong>{portfolios.length.toLocaleString()}</strong><em>Conservative normalization</em></article><article><span>Multi-fourplex groups</span><strong>{portfolios.filter((p) => p.count >= 2).length}</strong><em>Within this dataset</em></article></section>
      <section className="panel">
        <div className="panel-head"><div><h2>{view === "properties" ? "Ranked prospects" : "Owner portfolios"}</h2><p>{view === "properties" ? `${prospects.length} properties match the current filters` : `${owners.length} owner groups match the current filters`}</p></div>
          <form className="filters"><input name="view" value={view} type="hidden"/><input name="q" defaultValue={query.q} placeholder="Search address, owner, parcel…"/><select name="score" defaultValue={minimumScore}><option value="20">Score 20+</option><option value="40">Score 40+</option><option value="60">Score 60+</option><option value="80">Score 80+</option></select><button>Apply</button></form>
        </div>
        <div className="table-wrap">{view === "properties" ? <table><thead><tr><th>Score</th><th>Property</th><th>Owner</th><th>Years held</th><th>Portfolio</th><th>Assessed value</th><th>Signals</th></tr></thead><tbody>{prospects.slice(0, 150).map((p) => <tr key={p.parcelId}><td><b className={`score s${Math.floor(p.score / 20)}`}>{p.score}</b></td><td><a className="property" href={`/?view=properties&score=${minimumScore}&q=${encodeURIComponent(query.q ?? "")}&parcel=${p.parcelId}`}>{p.address}</a><small>Parcel {p.parcelId} · Built {p.yearBuilt ?? "—"}</small></td><td>{p.owner}<small>{p.ownerCity}, {p.ownerState}</small></td><td>{p.yearsOwned ?? "—"}</td><td>{p.portfolioCount} properties<small>{p.portfolioUnits} units</small></td><td>{money.format(p.assessedValue)}</td><td><div className="chips">{p.reasons.slice(0, 2).map((reason) => <span key={reason}>{reason}</span>)}</div></td></tr>)}</tbody></table> : <table><thead><tr><th>Score</th><th>Owner</th><th>Fourplexes</th><th>Units</th><th>20+ years</th><th>Assessed value</th><th>Properties</th></tr></thead><tbody>{owners.slice(0, 150).map((o) => <tr key={o.ownerKey}><td><b className={`score s${Math.floor(o.score / 20)}`}>{Math.min(100, o.score)}</b></td><td className="property">{o.owner}</td><td>{o.count}</td><td>{o.units}</td><td>{o.longHeldCount}</td><td>{money.format(o.assessedValue)}</td><td><small>{o.addresses.slice(0, 3).join(" · ")}{o.addresses.length > 3 ? ` +${o.addresses.length - 3}` : ""}</small></td></tr>)}</tbody></table>}</div>
        <p className="table-note">Showing the first 150 matching records. Scores are screening indicators, not claims about an owner’s motivation.</p>
      </section>
      <section id="method" className="method"><div><p className="eyebrow">AUDITABLE BY DESIGN</p><h2>Every score explains itself.</h2><p>No black box. Ownership duration, mailing-address differences, owner type, building age, and portfolio size remain visible in every result.</p></div><div className="rubric"><span>Ownership duration <b>up to 40</b></span><span>Absentee / out of state <b>up to 35</b></span><span>Owner and building <b>up to 25</b></span><span>Portfolio bonus <b>up to 15</b></span></div></section>
    </main>
    {selected && <div className="drawer"><a className="close" href={`/?view=properties&score=${minimumScore}&q=${encodeURIComponent(query.q ?? "")}`}>×</a><p className="eyebrow">PROPERTY DETAIL</p><h2>{selected.address}</h2><b className="score large">{selected.score}</b><dl><dt>Owner</dt><dd>{selected.owner}</dd><dt>Mailing address</dt><dd>{selected.ownerAddress}<br/>{selected.ownerCity}, {selected.ownerState} {selected.ownerZip}</dd><dt>Apparent acquisition</dt><dd>{selected.deedDate || "Unavailable"} · {selected.yearsOwned ?? "—"} years</dd><dt>Assessed value</dt><dd>{money.format(selected.assessedValue)}</dd><dt>Fourplex portfolio</dt><dd>{selected.portfolioCount} properties · {selected.portfolioUnits} units</dd></dl><h3>Score signals</h3><div className="chips vertical">{selected.reasons.map((r) => <span key={r}>{r}</span>)}</div><a className="primary drawer-action" href={`/analyze?parcel=${selected.parcelId}`}>Analyze this deal →</a><a className="evidence" target="_blank" rel="noreferrer" href={selected.evidenceUrl}>Open municipal evidence ↗</a></div>}
  </div>;
}
