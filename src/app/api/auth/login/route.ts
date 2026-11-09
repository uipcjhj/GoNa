import { NextResponse } from "next/server";
import { SESSION_COOKIE, authEnabled, checkPassword, createSession, secureCookie } from "@/lib/auth";

// Simple in-memory brute-force guard: 8 failed attempts per client per 10 minutes.
const FAILS = new Map<string, { n: number; until: number }>();
const WINDOW = 10 * 60_000;

function clientKey(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true, role: "admin" });
  const key = clientKey(req);
  const f = FAILS.get(key);
  if (f && f.n >= 8 && f.until > Date.now()) {
    return NextResponse.json({ error: "로그인 시도가 너무 많습니다. 10분 후 다시 시도해 주세요." }, { status: 429 });
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: unknown };
  const role = typeof password === "string" ? await checkPassword(password) : null;
  if (!role) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + WINDOW };
    FAILS.set(key, { n: cur.n + 1, until: cur.until });
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  FAILS.delete(key);
  const { token, maxAge } = await createSession(role);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: secureCookie(req), sameSite: "lax", path: "/", maxAge });
  return res;
}
