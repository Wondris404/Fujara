import { authorizeCloudRequest } from "@/domain/ownership";
import { driveConnection } from "@/domain/drive";
import { NextResponse } from "next/server";

const hits = new Map<string, { count: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || row.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 30;
}

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const decision = authorizeCloudRequest(request.headers.get("authorization"), process.env.FUJARA_SESSION_SECRET);
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
  return NextResponse.json({
    drive: driveConnection({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    backups: [],
  });
}
