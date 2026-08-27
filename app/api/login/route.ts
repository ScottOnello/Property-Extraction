import { NextRequest, NextResponse } from "next/server";

async function token() {
  const bytes = new TextEncoder().encode(`${process.env.AUTH_SECRET ?? ""}:${process.env.SITE_PASSWORD ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!process.env.SITE_PASSWORD || password !== process.env.SITE_PASSWORD) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, request.url), 303);
  }
  const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", request.url), 303);
  response.cookies.set("property_session", await token(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}
