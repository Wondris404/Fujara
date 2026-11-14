import { googleAuthorizeUrl, newPkceVerifier, pkceS256 } from "@/domain/drive-flow";
import { readGoogleOAuthConfig } from "@/domain/drive";
import { userIdFromRequest } from "@/server/request-user";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const userId = await userIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized", message: "Sign in before connecting Drive. Drive is optional and is not part of sign-in." }, { status: 401 });
  }
  const config = readGoogleOAuthConfig({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  });
  if (!config) {
    return NextResponse.json(
      { error: "not_connected", message: "Google OAuth is not configured." },
      { status: 503 },
    );
  }
  const state = crypto.randomUUID();
  const verifier = newPkceVerifier();
  const url = googleAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    codeChallenge: await pkceS256(verifier),
  });
  const response = NextResponse.redirect(url);
  const secure = new URL(request.url).protocol === "https:";
  const cookie = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 600 };
  response.cookies.set("fujara_oauth_state", state, cookie);
  response.cookies.set("fujara_oauth_verifier", verifier, cookie);
  return response;
}
