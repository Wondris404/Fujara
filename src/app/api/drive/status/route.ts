import { readDriveGrant } from "@/server/library-store";
import { userIdFromRequest } from "@/server/request-user";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.DATABASE_URL);
  const userId = await userIdFromRequest(request);
  if (!userId || !process.env.DATABASE_URL) return NextResponse.json({ configured, connected: false });
  try {
    const token = await readDriveGrant(userId);
    return NextResponse.json({ configured, connected: Boolean(token) });
  } catch {
    return NextResponse.json({ configured, connected: false, error: "status_failed" });
  }
}
