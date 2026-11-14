import { readLibraryForUser, writeLibraryForUser, type TrackWrite } from "@/server/library-store";
import { userIdFromRequest } from "@/server/request-user";
import { NextResponse } from "next/server";

function unavailable() {
  return NextResponse.json(
    { error: "not_connected", message: "Cloud library needs DATABASE_URL and FUJARA_SESSION_SECRET. Local playback does not use this route." },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  if (!process.env.FUJARA_SESSION_SECRET || !process.env.DATABASE_URL) return unavailable();
  const userId = await userIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const tracks = await readLibraryForUser(userId);
    return NextResponse.json({ userId, tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "query_failed";
    return NextResponse.json({ error: "query_failed", message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!process.env.FUJARA_SESSION_SECRET || !process.env.DATABASE_URL) return unavailable();
  const userId = await userIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: TrackWrite;
  try {
    body = (await request.json()) as TrackWrite;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const saved = await writeLibraryForUser(userId, body);
    if (saved.status === "invalid") return NextResponse.json({ error: "invalid_track" }, { status: 400 });
    if (saved.status === "stale") return NextResponse.json({ error: "stale_version" }, { status: 409 });
    return NextResponse.json({ userId, track: saved.track });
  } catch (error) {
    const message = error instanceof Error ? error.message : "query_failed";
    return NextResponse.json({ error: "query_failed", message }, { status: 502 });
  }
}
