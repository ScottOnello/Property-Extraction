# Email-code rollout

Only authentication, its tests, and deployment documentation change. No scraper,
data integration, or scheduled job configuration is changed.

## Provision production services

1. Create a dedicated Upstash Redis database with TLS and a writable REST token.
   Do not use process memory: Vercel requests can run in separate instances.
2. Verify a sending domain in Resend. Publish its SPF and DKIM DNS records and
   verify them in the provider. Add a DMARC policy appropriate to the domain.
   Use a dedicated sending subdomain to avoid disturbing existing business mail.
3. Configure Vercel secrets: UPSTASH_REDIS_REST_URL,
   UPSTASH_REDIS_REST_TOKEN, RESEND_API_KEY, AUTH_EMAIL_FROM.
   AUTH_SECRET must contain at least 32 cryptographically random characters.
   Keep all credentials server-only; never prefix them with NEXT_PUBLIC_.
4. Retain SITE_PASSWORD. Set EMAIL_CODE_ENABLED=true and
   PASSWORD_LOGIN_DISABLED=false. Deploy this repository's root Next.js app.

## Verify before cutover

- Request a code and confirm delivery to scott@anchorinvest.co, including inbox
  SPF/DKIM authentication results. Never put the code in deployment logs.
- Enter the delivered code in the same browser. Confirm dashboard access and
  that the session cookie is HttpOnly, Secure, SameSite=Strict.
- Confirm a consumed code cannot create another session.
- Confirm an unused code fails after ten minutes, a resend invalidates the prior
  code, five wrong guesses consume it, and resend limits are enforced.
- Confirm logout revokes the server session and protected routes require login.
- Run build, lint, Node auth tests, and Python Lua tests.

Only after these live checks pass, set PASSWORD_LOGIN_DISABLED=true, redeploy,
and verify email login again and that POST /api/login is rejected. Then remove
SITE_PASSWORD from Vercel. Keep AUTH_SECRET stable to preserve active sessions.
No live verification has been recorded by this document.

## Controls

Codes use cryptographic randomness, six digits, HMAC storage, and a ten-minute
Redis TTL. Code consumption and session creation run in one atomic Lua operation.
Codes are bound to a random HttpOnly browser cookie; the most recent code replaces
the previous one. Limits are shared across all instances: one send per minute,
five send requests per hour, five guesses per code, and ten valid-format guesses
per ten-minute window. Limits are global for this single-user application.
Sessions are random, stored by HMAC, expire after twelve hours, and are revoked
on logout. Storage or provider failures fail closed.

## Local checks

```sh
npm run lint
npm run build
node --experimental-strip-types --test tests/email-auth.test.mjs
python -m pip install 'fakeredis[lua]'
python -m unittest discover -s tests -p test_email_auth.py -v
```
