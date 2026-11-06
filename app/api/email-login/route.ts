import { NextRequest, NextResponse } from "next/server";
import { enabled, issueCode, safeNext, SESSION_TTL, verifyCode } from "../../../lib/email-auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!enabled()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return new NextResponse("Request too large", { status: 413 });
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const login = new URL("/login", request.url);
  login.searchParams.set("next", next);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
  try {
    if (form.get("action") === "send") {
      const challenge = await issueCode();
      if (!challenge) {
        login.searchParams.set("error", "rate");
        return NextResponse.redirect(login, 303);
      }
      login.searchParams.set("sent", "1");
      const response = NextResponse.redirect(login, 303);
      response.cookies.set("property_challenge", challenge, { ...options, maxAge: 1800 });
      return response;
    }
    const session = await verifyCode(String(form.get("code") ?? ""), request.cookies.get("property_challenge")?.value ?? "");
    if (!session) {
      login.searchParams.set("error", "code");
      return NextResponse.redirect(login, 303);
    }
    const response = NextResponse.redirect(new URL(next, request.url), 303);
    response.cookies.set("property_email_session", session, { ...options, maxAge: SESSION_TTL });
    response.cookies.set("property_challenge", "", { ...options, maxAge: 0 });
    return response;
  } catch {
    return new NextResponse("Sign-in is temporarily unavailable. Please try again later.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

