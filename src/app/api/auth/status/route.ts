import { userIdFromRequest } from "@/server/request-user";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.FUJARA_SESSION_SECRET);
  const userId = await userIdFromRequest(request);
  return NextResponse.json({
    configured,
    signedIn: Boolean(userId),
    userId: userId ?? null,
    database: Boolean(process.env.DATABASE_URL),
  });
}
