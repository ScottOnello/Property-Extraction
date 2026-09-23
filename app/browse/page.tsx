import { getAnchorageListings } from "@/lib/anchorage-listings";
import { getOffMarketCandidates } from "@/lib/off-market-data";
import "./browse.css";

export const metadata = {
  title: "Browse Anchorage Deals | Property Extraction",
  description: "Filter Anchorage MLS listings and off-market fourplex candidates by bedrooms, bathrooms, and investment property type.",
};

type Query = { beds?: string; baths?: string; type?: string; source?: string; q?: string };
type Deal = {
  id: string; address: string; source: "MLS active" | "Off-market candidate";
  units: number | null; bedrooms: number | null; bathrooms: number | null;
  price: number | null; priceLabel: string; garageSpaces: number | null;
  detail: string; href: string;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const minimum = (raw?: string) => raw ? Math.max(0, Math.min(10, Number.parseInt(raw, 10) || 0)) : 0;

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const beds = minimum(query.beds);
  const baths = minimum(query.baths);
  const type = ["all", "investment", "fourplex", "fiveplus", "single"].includes(query.type ?? "") ? query.type! : "all";
  const source = ["all", "mls", "offmarket"].includes(query.source ?? "") ? query.source! : "all";
  const search = (query.q ?? "").trim().toLowerCase();
  const [mlsResult, offMarketResult] = await Promise.allSettled([getAnchorageListings(), getOffMarketCandidates()]);
  const mls = mlsResult.status === "fulfilled" ? mlsResult.value : null;
  const offMarket = offMarketResult.status === "fulfilled" ? offMarketResult.value : null;
  const deals: Deal[] = [
    ...(mls?.listings ?? []).map((listing): Deal => ({
      id: `mls-${listing.listingId}`, address: listing.address, source: "MLS active",
      units: listing.units, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms,
      price: listing.listPrice, priceLabel: "List price", garageSpaces: listing.garageSpaces,
      detail: [listing.propertySubtype || listing.propertyType, `MLS ${listing.listingId}`, listing.postalCode].filter((part) => part && part.length > 1).join(" · "),
      href: `/analyze?listing=${encodeURIComponent(listing.listingId)}`,
    })),
    ...(offMarket?.candidates ?? []).map((candidate): Deal => ({
      id: `parcel-${candidate.parcelId}`, address: candidate.address, source: "Off-market candidate",
      units: 4, bedrooms: null, bathrooms: null, price: candidate.assessedValue,
      priceLabel: "Assessment", garageSpaces: null,
      detail: [`Parcel ${candidate.parcelId}`, `${candidate.yearsOwned ?? "?"} apparent years held`, candidate.screeningTier].join(" · "),
      href: `/analyze?parcel=${encodeURIComponent(candidate.parcelId)}`,
    })),
  ];
  const filtered = deals.filter((deal) => {
    if (source === "mls" && deal.source !== "MLS active") return false;
    if (source === "offmarket" && deal.source !== "Off-market candidate") return false;
    if (beds > 0 && (deal.bedrooms === null || deal.bedrooms < beds)) return false;
    if (baths > 0 && (deal.bathrooms === null || deal.bathrooms < baths)) return false;
    if (type === "investment" && (deal.units === null || deal.units < 2)) return false;
    if (type === "fourplex" && deal.units !== 4) return false;
    if (type === "fiveplus" && (deal.units === null || deal.units < 5)) return false;
    if (type === "single" && deal.units !== 1) return false;
    return !search || `${deal.address} ${deal.detail}`.toLowerCase().includes(search);
  });

  return <div className="app-shell browse-shell">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a className="active" href="/browse">Browse deals</a><a href="/">Fourplex prospects</a><a href="/off-market">Off-market candidates</a><a href="/off-market/garage-audit">Visual garage audit</a><a href="/garages">Garage deals</a><a href="/rankings">Deal rankings</a><a href="/analyze">Buy Lab</a><a href="/flexmls">Flexmls</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="workspace browse-workspace">
      <header className="browse-header"><div><p className="eyebrow">ANCHORAGE DEAL BROWSER</p><h1>Find a property to analyze</h1><p className="muted">Active Alaska MLS listings and long-held off-market fourplex candidates in one place.</p></div></header>
      <form className="browse-ribbon" aria-label="Filter Anchorage deals" action="/browse">
        <label>Bedrooms<select name="beds" defaultValue={beds}><option value="0">Any beds</option>{[1,2,3,4,5,6,8,10].map((value) => <option key={value} value={value}>{value}+ beds</option>)}</select></label>
        <label>Bathrooms<select name="baths" defaultValue={baths}><option value="0">Any baths</option>{[1,2,3,4,5,6,8,10].map((value) => <option key={value} value={value}>{value}+ baths</option>)}</select></label>
        <label>Property<select name="type" defaultValue={type}><option value="all">All property types</option><option value="investment">Investment · 2+ units</option><option value="fourplex">Fourplex · 4 units</option><option value="fiveplus">5+ units</option><option value="single">Single unit</option></select></label>
        <label>Source<select name="source" defaultValue={source}><option value="all">All sources</option><option value="mls">Active MLS</option><option value="offmarket">Off-market candidates</option></select></label>
        <label className="browse-search">Search<input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Address or MLS number"/></label>
        <button type="submit">Show deals</button><a className="browse-clear" href="/browse">Clear</a>
      </form>
      <div className="browse-summary"><b>{filtered.length.toLocaleString()}</b> matches from {deals.length.toLocaleString()} loaded properties{mls && mls.totalRows > mls.loadedRows ? ` · showing the ${mls.loadedRows.toLocaleString()} most recently updated MLS rows of ${mls.totalRows.toLocaleString()}` : ""}</div>
      {(beds > 0 || baths > 0) && <p className="browse-note">Bed and bath filters use reported MLS values. Municipal off-market records without those fields are excluded while a bed or bath minimum is selected.</p>}
      {!mls && <p className="browse-warning">The live MLS feed is temporarily unavailable. Off-market records are shown if available.</p>}
      {!offMarket && <p className="browse-warning">Off-market records are temporarily unavailable. MLS listings are shown if available.</p>}
      <section className="browse-results" aria-label="Matching Anchorage deals">
        {filtered.slice(0, 150).map((deal) => <article className="browse-card" key={deal.id}>
          <div><span className={deal.source === "MLS active" ? "browse-source mls" : "browse-source offmarket"}>{deal.source}</span><h2>{deal.address}</h2><p>{deal.detail}</p></div>
          <div className="browse-facts"><span><b>{deal.bedrooms ?? "—"}</b> beds</span><span><b>{deal.bathrooms ?? "—"}</b> baths</span><span><b>{deal.units ?? "—"}</b> units</span><span><b>{deal.garageSpaces ?? "—"}</b> garage</span></div>
          <div className="browse-action"><small>{deal.priceLabel}</small><strong>{deal.price !== null ? money.format(deal.price) : "Not reported"}</strong><a href={deal.href}>Open Buy Lab →</a></div>
        </article>)}
        {!filtered.length && <div className="browse-empty"><h2>No properties match these filters</h2><p>Try fewer bedrooms or bathrooms, or switch the source back to all.</p></div>}
      </section>
      {filtered.length > 150 && <p className="browse-note">Showing the first 150 matches. Narrow the ribbon filters to focus the list.</p>}
      <p className="browse-footer">MLS results refresh every 15 minutes. “Off-market candidate” is a screening label; verify listing status, beds, baths, ownership, and availability before acting.</p>
    </main>
  </div>;
}
