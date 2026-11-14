import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "not_connected", message: "Google sign-in is not configured." }, { status: 503 });
  }
  const origin = new URL(request.url).origin;
  const redirectUri = process.env.GOOGLE_SIGNIN_REDIRECT_URI || `${origin}/api/auth/google/callback`;
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  const response = NextResponse.redirect(url);
  const secure = origin.startsWith("https:");
  response.cookies.set("fujara_auth_state", state, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
  return response;
}
