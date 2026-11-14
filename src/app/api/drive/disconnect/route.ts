import { readGoogleOAuthConfig } from "@/domain/drive";
import { clearDriveGrant, readDriveGrant } from "@/server/library-store";
import { userIdFromRequest } from "@/server/request-user";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const userId = await userIdFromRequest(request);
  if (!userId || !process.env.DATABASE_URL) return NextResponse.json({ error: "not_connected" }, { status: 503 });
  const refresh = await readDriveGrant(userId);
  const config = readGoogleOAuthConfig({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  });
  if (refresh && config) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => undefined);
  }
  await clearDriveGrant(userId);
  return NextResponse.json({ connected: false });
}
