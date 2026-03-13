import { NextResponse } from "next/server";

export async function GET() {
  const res = await fetch("https://api.teller.io/institutions");
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch institutions" }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data);
}
