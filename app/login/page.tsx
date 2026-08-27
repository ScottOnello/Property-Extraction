export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const query = await searchParams;
  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">PE</div><p className="eyebrow">ANCHORAGE ACQUISITIONS</p>
    <h1>Property intelligence, privately organized.</h1>
    <p className="muted">Sign in to review fourplex prospects, owner portfolios, and transparent opportunity scores.</p>
    <form action="/api/login" method="post"><input type="hidden" name="next" value={query.next ?? "/"} />
      <label htmlFor="password">Access password</label><input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      {query.error && <p className="error">That password was not accepted.</p>}<button type="submit">Open dashboard</button>
    </form><p className="fine">Assessment data is a screening source. Verify ownership and deed history independently.</p>
  </section></main>;
}
