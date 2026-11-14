import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  const response = NextResponse.json({ signedIn: false });
  response.cookies.set("fujara_session", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  return response;
}
