import { NextRequest, NextResponse } from "next/server";
import { safeNext } from "../../../lib/email-auth";
import { authenticatorEnabled, AUTHENTICATOR_SESSION_SECONDS, newAuthenticatorSession, validAuthenticatorCode } from "../../../lib/authenticator-auth";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  if (!authenticatorEnabled()) return new NextResponse("Authenticator login is not configured", { status: 503 });
  const form = await request.formData();
  const code = String(form.get("code") ?? "");
  const next = safeNext(form.get("next"));
  if (!validAuthenticatorCode(code)) {
    return NextResponse.redirect(new URL(`/login?error=authenticator&next=${encodeURIComponent(next)}`, request.url), 303);
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set("property_totp_session", newAuthenticatorSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: AUTHENTICATOR_SESSION_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
