import { googleSubToUserId } from "@/server/account-id";
import { cookieValue } from "@/server/request-user";
import { issueSession } from "@/server/session";
import { getPool } from "@/server/postgres";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const secret = process.env.FUJARA_SESSION_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret || !clientId || !clientSecret) {
    return NextResponse.json({ error: "not_connected", message: "Google sign-in needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and FUJARA_SESSION_SECRET." }, { status: 503 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookieValue(request.headers.get("cookie"), "fujara_auth_state");
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }
  const redirectUri = process.env.GOOGLE_SIGNIN_REDIRECT_URI || `${url.origin}/api/auth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!tokenResponse.ok) return NextResponse.json({ error: "token_exchange_failed" }, { status: 502 });
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return NextResponse.json({ error: "token_exchange_failed" }, { status: 502 });
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) return NextResponse.json({ error: "profile_failed" }, { status: 502 });
  const profile = (await profileResponse.json()) as { sub?: string };
  if (!profile.sub) return NextResponse.json({ error: "profile_failed" }, { status: 502 });
  const userId = googleSubToUserId(profile.sub);
  if (getPool()) {
    const { withUser } = await import("@/server/postgres");
    await withUser(userId, (query) => query(`insert into profiles (id, display_name) values ($1, 'Fujara') on conflict (id) do nothing`, [userId]));
  }
  const session = await issueSession(userId, secret);
  const response = NextResponse.redirect(new URL("/settings?account=signed-in", request.url));
  response.cookies.set("fujara_session", session, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  response.cookies.set("fujara_auth_state", "", { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 0 });
  return response;
}
