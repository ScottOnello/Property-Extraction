import { authenticatorEnabled, setupDetails } from "../../../lib/authenticator-auth";

export const dynamic = "force-dynamic";

export default function AuthenticatorSetup() {
  if (!authenticatorEnabled()) return <main className="login-shell"><section className="login-card"><h1>Authenticator setup is not available yet.</h1><a href="/">Return to the dashboard</a></section></main>;
  const { secret, uri } = setupDetails();
  return <main className="login-shell"><section className="login-card">
    <div className="brand-mark">PE</div>
    <h1>Use your phone to sign in</h1>
    <p className="muted">Open this page on your phone, then tap the button to add Property Extraction to your authenticator app. You only need to do this once.</p>
    <p><a className="setup-link" href={uri}>Add to authenticator app</a></p>
    <p className="muted">If the button does not open your authenticator, add an account manually with this setup key:</p>
    <p className="setup-key">{secret}</p>
    <p className="fine">Keep this key private. Anyone with it can generate sign-in codes. Return to the dashboard when setup is done.</p>
    <a href="/">Return to dashboard</a>
  </section></main>;
}
