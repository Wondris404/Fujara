import { readGoogleOAuthConfig } from "@/domain/drive";
import { NextResponse } from "next/server";

function cookieValue(header: string | null, name: string): string | null {
  const parts = header?.split(";") ?? [];
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function clearPkce(response: NextResponse, secure: boolean) {
  const expired = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 0 };
  response.cookies.set("fujara_oauth_state", "", expired);
  response.cookies.set("fujara_oauth_verifier", "", expired);
}

export async function GET(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  const config = readGoogleOAuthConfig({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  });
  if (!config) {
    return NextResponse.json(
      { error: "not_connected", message: "Google OAuth is not configured. No token was stored." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const expected = cookieValue(request.headers.get("cookie"), "fujara_oauth_state");
  const verifier = cookieValue(request.headers.get("cookie"), "fujara_oauth_verifier");
  if (oauthError || !code || !state || !expected || state !== expected || !verifier) {
    const response = NextResponse.json({ error: "invalid_state" }, { status: 400 });
    clearPkce(response, secure);
    return response;
  }

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) {
    const response = NextResponse.json({ error: "token_exchange_failed" }, { status: 502 });
    clearPkce(response, secure);
    return response;
  }

  const token = (await tokenResponse.json()) as { refresh_token?: string };
  if (!token.refresh_token) {
    const response = NextResponse.json(
      { error: "no_refresh_token", message: "Google did not return a refresh token. No file was uploaded." },
      { status: 502 },
    );
    clearPkce(response, secure);
    return response;
  }

  const response = NextResponse.redirect(new URL("/settings?drive=authorized", request.url));
  response.cookies.set("fujara_drive_refresh", token.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/drive",
    maxAge: 60 * 24 * 60 * 60,
  });
  clearPkce(response, secure);
  return response;
}
