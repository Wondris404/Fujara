import { readSession } from "@/server/session";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (!process.env.FUJARA_SESSION_SECRET || !process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "not_connected", message: "Cloud library is not configured. Local playback does not use this route." },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = await readSession(token, process.env.FUJARA_SESSION_SECRET);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ userId, entries: [], note: "Database URL is set, but this build has no live Postgres driver connected." });
}

export async function POST(request: Request) {
  if (!process.env.FUJARA_SESSION_SECRET || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "not_connected" }, { status: 503 });
  }
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = await readSession(token, process.env.FUJARA_SESSION_SECRET);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "not_configured", userId }, { status: 501 });
}
