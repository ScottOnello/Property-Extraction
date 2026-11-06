import { NextRequest, NextResponse } from "next/server";
import { digest, redis } from "../../../lib/email-auth";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  const session = request.cookies.get("property_email_session")?.value;
  if (session && /^[a-f0-9]{64}$/.test(session)) {
    try { await redis("DEL", `auth:session:${digest(session)}`); }
    catch { return new NextResponse("Sign-out temporarily unavailable", { status: 503 }); }
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  for (const name of ["property_session", "property_email_session", "property_challenge"]) {
    response.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  }
  return response;
}

