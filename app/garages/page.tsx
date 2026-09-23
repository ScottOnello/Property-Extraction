import { getGarageDeals } from "@/lib/garage-data";
import GarageDealsMap from "./GarageDealsMap";
import "./garages.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US");

export const metadata = {
  title: "Garage Deals | Property Extraction",
  description: "Multi-family Alaska MLS records with reported garage spaces.",
};

export default async function GarageDealsPage() {
  const { generatedAt, deals, sourceRows } = await getGarageDeals();
  const active = deals.filter((deal) => deal.Status.toLowerCase() === "active");
  const garageTotal = deals.reduce((sum, deal) => sum + deal.Garage_Spaces, 0);
  const knownArea = deals.filter((deal) => deal.Building_Area !== null);

  return <div className="garage-shell">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a href="/browse">Browse deals</a><a href="/">Fourplex prospects</a><a href="/off-market">Off-market candidates</a><a href="/sixplexes">Sixplex prospects</a><a className="active" href="/garages">Garage deals</a><a href="/rankings">Deal rankings</a><a href="/analyze">Buy Lab</a><a href="/flexmls">Flexmls</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="garage-workspace">
      <header className="garage-header"><div><p className="eyebrow">ALASKA MLS · MULTI-FAMILY AMENITY SCREEN</p><h1>Garage Deals</h1><p className="muted">Recent MLS records for properties with two or more units and at least one reported garage space.</p></div><div className="garage-source"><span><i/> MLS-reported garages only</span><small>Refreshed {new Date(generatedAt).toLocaleDateString("en-US", { timeZone: "America/Anchorage", month: "short", day: "numeric", year: "numeric" })}</small></div></header>
      <section className="garage-metrics"><article className="garage-primary"><span>Garage deals</span><strong>{deals.length.toLocaleString()}</strong><em>Unique property addresses</em></article><article><span>Garage spaces</span><strong>{garageTotal.toLocaleString()}</strong><em>Across listed properties</em></article><article><span>Active records</span><strong>{active.length.toLocaleString()}</strong><em>Latest MLS status</em></article><article><span>Known building area</span><strong>{knownArea.length.toLocaleString()}</strong><em>MLS-reported square footage</em></article></section>
      <section className="garage-panel"><div className="garage-toolbar"><div><h2>MLS garage-screened properties</h2><p>{deals.length} unique addresses from the {sourceRows.toLocaleString()} most recently modified matching MLS records.</p></div><span>Click a row to underwrite</span></div>
        <div className="garage-table-wrap"><table><thead><tr><th>Property</th><th>Garage</th><th>Type</th><th>Latest MLS</th><th>Price reference</th><th>Building</th><th/></tr></thead><tbody>{deals.map((deal) => <tr key={deal.Listing_Id}><td><b>{deal.Address}</b><small>{[deal.City, deal.State, deal.Postal_Code].filter(Boolean).join(", ")}{deal.Subdivision ? ` · ${deal.Subdivision}` : ""}</small></td><td><b>{deal.Garage_Spaces} space{deal.Garage_Spaces === 1 ? "" : "s"}</b><small>{deal.Carport_Spaces ? `${deal.Carport_Spaces} carport space${deal.Carport_Spaces === 1 ? "" : "s"} also reported` : "Garage only"}</small></td><td>{deal.Units ? `${deal.Units} units` : "Multi-family"}<small>{deal.Property_Subtype || "MLS multi-family"}</small></td><td><span className={`garage-status garage-status-${deal.Status.toLowerCase() === "active" ? "active" : "other"}`}>{deal.Status}</span><small>{deal.Close_Date ? `Closed ${deal.Close_Date}` : deal.Modified_At ? `Updated ${deal.Modified_At.slice(0, 10)}` : "Date unavailable"}</small></td><td><b>{deal.List_Price ? money.format(deal.List_Price) : deal.Close_Price ? money.format(deal.Close_Price) : "—"}</b><small>{deal.List_Price ? "List price" : deal.Close_Price ? "Close price" : "No price reported"}</small></td><td>{deal.Building_Area ? `${number.format(deal.Building_Area)} sq ft` : "Area unavailable"}<small>{deal.Year_Built ? `Built ${deal.Year_Built}` : "Year unavailable"}</small></td><td><a className="garage-analyze" href={`/analyze?listing=${encodeURIComponent(deal.Listing_Id)}`}>Analyze →</a></td></tr>)}</tbody></table></div>
        {!deals.length && <div className="garage-empty"><h2>No MLS garage records available</h2><p>The feed returned no multi-family records with a reported garage space. Try again after the next data refresh.</p></div>}
        <p className="garage-note">This tab uses the MLS `GarageSpaces` field. It excludes carport-only properties and does not infer a garage from photos, aerial imagery, or municipal parcel data. Verify all facts, availability, and price before an offer.</p>
      </section>
      <GarageDealsMap deals={deals}/>
    </main>
  </div>;
}
