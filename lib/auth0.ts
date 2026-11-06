import { Auth0Client } from "@auth0/nextjs-auth0/server";

export function authConfigured() {
  return ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET", "APP_BASE_URL"].every((key) => Boolean(process.env[key]));
}

let client: Auth0Client | undefined;
export function getAuth0() {
  return client ??= new Auth0Client({
    authorizationParameters: {
      scope: "openid profile email",
      acr_values: "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
    },
    session: { rolling: false, absoluteDuration: 60 * 60 * 12 },
    enableAccessTokenEndpoint: false,
    beforeSessionSaved: async (session) => ({
      ...session,
      user: { sub: session.user.sub, email: session.user.email, email_verified: session.user.email_verified, amr: session.user.amr },
    }),
  });
}
