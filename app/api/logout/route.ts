import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  const response = NextResponse.redirect(new URL("/auth/logout", request.url), 303);
  response.cookies.set("property_session", "", { expires: new Date(0), path: "/" });
  return response;
}
