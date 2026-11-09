import { NextResponse } from "next/server";
import { SESSION_COOKIE, secureCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: secureCookie(req), sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
