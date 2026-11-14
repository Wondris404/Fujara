import { readGoogleOAuthConfig } from "@/domain/drive";
import { readDriveGrant } from "@/server/library-store";
import { userIdFromRequest } from "@/server/request-user";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const userId = await userIdFromRequest(request);
  const config = readGoogleOAuthConfig({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  });
  if (!userId || !config || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "not_connected" }, { status: 503 });
  }
  const refresh = await readDriveGrant(userId);
  if (!refresh) return NextResponse.json({ error: "drive_not_connected" }, { status: 401 });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenResponse.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
  const token = (await tokenResponse.json()) as { access_token?: string; expires_in?: number };
  if (!token.access_token) return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
  return NextResponse.json({ accessToken: token.access_token, expiresIn: token.expires_in ?? 3600 });
}
