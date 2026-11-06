import { enabled } from "../../lib/email-auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string }> }) {
  const query = await searchParams;
  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">PE</div><p className="eyebrow">ANCHORAGE ACQUISITIONS</p>
    <h1>Property intelligence, privately organized.</h1>
    <p className="muted">Sign in to review fourplex prospects, owner portfolios, and transparent opportunity scores.</p>
    {enabled() && <>
      <p>Receive a six-digit code at scott@anchorinvest.co. Codes expire after 30 minutes.</p>
      <form action="/api/email-login" method="post">
        <input type="hidden" name="next" value={query.next ?? "/"} />
        <input type="hidden" name="action" value="send" />
        <button type="submit">{query.sent ? "Send a new code" : "Email me a sign-in code"}</button>
      </form>
      <form action="/api/email-login" method="post">
        <input type="hidden" name="next" value={query.next ?? "/"} />
        <input type="hidden" name="action" value="verify" />
        <label htmlFor="code">Email code</label>
        <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
        <button type="submit">Sign in</button>
      </form>
      {query.sent && <p>Code sent. Check your inbox.</p>}
      {query.error && <p className="error">{query.error === "rate" ? "Please wait before requesting another code. Limit: five requests per hour." : "The code was not accepted. It may have expired or already been used."}</p>}
    </>}
    {process.env.PASSWORD_LOGIN_DISABLED !== "true" && <form action="/api/login" method="post"><input type="hidden" name="next" value={query.next ?? "/"} />
      <label htmlFor="password">Access password</label><input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      {query.error === "1" && <p className="error">That password was not accepted.</p>}<button type="submit">Open dashboard</button>
    </form>}<p className="fine">Assessment data is a screening source. Verify ownership and deed history independently.</p>
  </section></main>;
}

