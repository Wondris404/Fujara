import { driveConnection } from "@/domain/drive";
import { readSession } from "@/server/session";
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
  if (!process.env.FUJARA_SESSION_SECRET) {
    return NextResponse.json({ error: "not_connected" }, { status: 503 });
  }
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = await readSession(token, process.env.FUJARA_SESSION_SECRET);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    userId,
    drive: driveConnection({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    backups: [],
  });
}
