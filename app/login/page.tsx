import { safeReturnTo } from "../../lib/access";
import { authConfigured } from "../../lib/auth0";
export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const query = await searchParams;
  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">PE</div><p className="eyebrow">ANCHORAGE ACQUISITIONS</p>
    <h1>Sign in to your property desk.</h1>
    <p className="muted">Use your individual account and authenticator to access your private dashboard.</p>
    {authConfigured() ? <a href={"/auth/login?returnTo=" + encodeURIComponent(safeReturnTo(query.next))}>Sign in securely</a> : <p>Secure sign-in is being configured. Please try again later.</p>}
    <p className="fine">Access is limited to the approved account. Your authenticator code is requested during sign-in.</p>
  </section></main>;
}
