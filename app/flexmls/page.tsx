import "./flexmls.css";

export const metadata = {
  title: "Flexmls | Property Extraction",
  description: "Quick access to Alaska MLS Flexmls and the Alaska MLS member portal.",
};

export default function FlexmlsPage() {
  return <div className="app-shell">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a href="/">Fourplex prospects</a><a href="/off-market">Off-market candidates</a><a href="/off-market/garage-audit">Visual garage audit</a><a href="/garages">Garage deals</a><a href="/analyze">Buy Lab</a><a className="active" href="/flexmls">Flexmls</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="workspace flexmls-workspace">
      <p className="eyebrow">ALASKA MLS ACCESS</p>
      <h1>Flexmls</h1>
      <p className="muted flexmls-intro">Open your Alaska MLS workspace alongside Property Extraction to check current listings, photos, and MLS details.</p>
      <section className="flexmls-links" aria-label="MLS access links">
        <article className="flexmls-primary"><span>AGENT WORKSPACE</span><h2>Open Alaska Flexmls</h2><p>Sign in with your Alaska MLS Flexmls credentials. Opens in a separate tab so you can return to your deal analysis.</p><a href="https://ak.flexmls.com/ticket" target="_blank" rel="noopener noreferrer">Open Flexmls ↗</a></article>
        <article><span>ACCOUNT &amp; MEMBER SERVICES</span><h2>Alaska MLS member portal</h2><p>Use the member portal for account access and MLS services.</p><a href="https://www.akmls.com/Identity/Account/Login" target="_blank" rel="noopener noreferrer">Open member portal ↗</a></article>
      </section>
      <p className="flexmls-note">This page opens the official MLS sign-in sites. Your Flexmls session and password stay with the MLS; this page does not sign you in or change the data feed used by Property Extraction.</p>
    </main>
  </div>;
}
