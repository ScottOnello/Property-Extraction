import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Shared password sign-in has been retired. Use /login." }, { status: 410 });
}
