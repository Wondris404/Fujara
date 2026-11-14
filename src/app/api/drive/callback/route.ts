import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error: "not_connected",
        message: "Google OAuth is not configured. Fujara did not exchange a code or store a token.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      error: "not_implemented",
      message: "Credentials are present, but this starter does not complete the token exchange until the redirect and state checks are configured.",
    },
    { status: 501 },
  );
}
