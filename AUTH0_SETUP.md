# Auth0 activation for Property Extraction

Code is prepared; do not deploy before tenant configuration is complete.

1. Sign in to or create your Auth0 tenant yourself. Choose a dedicated tenant and a Regular Web Application named Property Extraction. Do not purchase a plan without reviewing its cost and MFA entitlement.
2. Enable an individual identity connection. Disable public signups for the database connection. Provision only scott@anchorinvest.co and verify its email through the normal verification flow.
3. Under Security > Multi-factor Auth, enable Authenticator OTP, disable other optional factors, and require MFA Always. Keep recovery codes secure.
4. Create a Post Login Action from scripts/auth0-post-login.cjs. Add its PROPERTY_APP_CLIENT_ID secret, deploy it, and attach it to the Login flow. This enforces the approved verified email and disables remembered-device MFA bypass.
5. Register the exact deployment origin plus /auth/callback as Allowed Callback URL, and the exact origin as Allowed Logout URL. Use the branch preview's stable alias initially; do not use wildcard callback domains.
6. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET (a fresh random 32-byte hex value), and APP_BASE_URL in that Vercel environment. APP_BASE_URL must be the exact registered origin. Keep credentials out of chat and Git. The official SDK encrypts session cookies.
7. Deploy a preview, sign in as scott@anchorinvest.co, enroll your authenticator yourself, and complete its challenge. Confirm dashboard access. Sign out and confirm the next sign-in requires MFA. Verify a different email, unverified email, and a session without the mfa claim cannot access dashboard pages or APIs. An old property_session cookie must not grant access.
8. Only after the live sign-in test passes, configure the production callback/origin and environment, and publish. Remove the obsolete SITE_PASSWORD and AUTH_SECRET variables after migration. Keep the prior deployment available for rollback until validation is complete.

The application also enforces verified owner email and the signed ID token's amr=mfa claim on every protected request. Missing configuration returns 503. A signed session without sufficient identity/MFA returns 403. Shared-password login is retired and old cookies are ignored. Sessions expire after 12 hours and do not roll indefinitely.

Local checks: pnpm exec tsc --noEmit; node --experimental-strip-types --test tests/access.test.ts tests/auth0-action.test.cjs; pnpm build.

References: https://auth0.github.io/nextjs-auth0/ and https://support.auth0.com/center/s/article/Users-are-not-prompted-to-MFA-after-activation-of-a-factor
