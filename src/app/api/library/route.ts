import { authorizeCloudRequest } from "@/domain/ownership";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const decision = authorizeCloudRequest(request.headers.get("authorization"), process.env.FUJARA_SESSION_SECRET);
  if (!decision.ok) {
    return NextResponse.json(
      { error: decision.error, message: "Cloud library is not available. Local playback does not use this route." },
      { status: decision.status },
    );
  }
  return NextResponse.json({ entries: [], note: "No database is configured in this starter." });
}

export async function POST(request: Request) {
  const decision = authorizeCloudRequest(request.headers.get("authorization"), process.env.FUJARA_SESSION_SECRET);
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  return NextResponse.json({ error: "not_configured" }, { status: 501 });
}
