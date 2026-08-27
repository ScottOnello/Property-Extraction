import { NextRequest, NextResponse } from "next/server";

async function expectedToken() {
  const secret = process.env.AUTH_SECRET ?? "";
  const password = process.env.SITE_PASSWORD ?? "";
  const bytes = new TextEncoder().encode(`${secret}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login") || pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();
  if (!process.env.SITE_PASSWORD || !process.env.AUTH_SECRET) return new NextResponse("Application authentication is not configured.", { status: 503 });
  const supplied = request.cookies.get("property_session")?.value;
  if (supplied === await expectedToken()) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
