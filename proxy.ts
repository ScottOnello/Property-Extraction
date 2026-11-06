import { NextRequest, NextResponse } from "next/server";
import { authConfigured, getAuth0 } from "./lib/auth0";
import { hasAccess } from "./lib/access";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login") return NextResponse.next();
  if (!authConfigured()) return new NextResponse("Secure sign-in is being configured. Please try again later.", { status: 503 });
  const auth0 = getAuth0();
  const response = await auth0.middleware(request);
  if (path.startsWith("/auth/")) return response;
  const session = await auth0.getSession(request);
  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  if (!hasAccess(session.user)) {
    return new NextResponse("Access requires the approved verified email account and a completed two-factor sign-in. Sign out at /auth/logout and try again.", { status: 403 });
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"] };
