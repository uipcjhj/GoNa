import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, verifySession, viewerMayCallApi, viewerMayOpenPage } from "@/lib/auth";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/** Redirect on the public origin: behind Codespaces port forwarding / reverse proxies the Host header can be "localhost". */
function redirectTo(req: NextRequest, location: string) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0]!.trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")).split(",")[0]!.trim();
  const res = NextResponse.redirect(new URL(location, `${proto === "https" ? "https" : "http"}://${host}`), 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Same-origin check for state-changing requests (defence in depth on top of SameSite cookies). */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients still need a valid session cookie
  let host: string;
  try { host = new URL(origin).host; } catch { return false; }
  const allowed = [req.headers.get("x-forwarded-host"), req.headers.get("host"), req.nextUrl.host].filter(Boolean).flatMap((h) => h!.split(",").map((x) => x.trim()));
  return allowed.includes(host);
}

export async function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  // public: login, cron (own secret), internal job chaining (own secret)
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/cron/") || /^\/api\/jobs\/[^/]+\/continue$/.test(pathname)) {
    if (pathname.startsWith("/api/auth/") && !SAFE.has(req.method) && !sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.next();
  }
  const role = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!role) {
    if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return redirectTo(req, `/login?next=${encodeURIComponent(pathname)}`);
  }
  if (!SAFE.has(req.method) && !sameOrigin(req)) return NextResponse.json({ error: "forbidden (origin)" }, { status: 403 });
  if (role === "viewer") {
    if (isApi) {
      if (!viewerMayCallApi(pathname, req.method)) return NextResponse.json({ error: "읽기 전용 계정에서는 사용할 수 없는 기능입니다." }, { status: 403 });
    } else if (!SAFE.has(req.method)) {
      return NextResponse.json({ error: "읽기 전용 계정입니다." }, { status: 403 });
    } else if (!viewerMayOpenPage(pathname)) {
      return redirectTo(req, "/");
    }
  }
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|json)$).*)"],
};
