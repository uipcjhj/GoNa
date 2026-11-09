// Password access control with two roles (enabled when any password env var is set).
// - admin  : APP_PASSWORD (or APP_PASSWORD_HASH)      → every feature
// - viewer : VIEWER_PASSWORD (or VIEWER_PASSWORD_HASH) → read-only pages, all write APIs blocked
// Passwords live only in env vars; they are never stored in the DB, logged or sent to the browser.
// Input is compared via SHA-256 digests (constant time) or PBKDF2 hashes (`npm run hash-password`).
// The session cookie holds only "role.expiry.signature" (HMAC-SHA256), never a password.
export type Role = "admin" | "viewer";
export const SESSION_COOKIE = "gor_session";
const SESSION_DAYS: Record<Role, number> = { admin: 30, viewer: 14 };

const env = (k: string) => (process.env[k] ?? "").trim();
const hasAdmin = () => Boolean(env("APP_PASSWORD") || env("APP_PASSWORD_HASH"));
const hasViewer = () => Boolean(env("VIEWER_PASSWORD") || env("VIEWER_PASSWORD_HASH"));
export const authEnabled = () => hasAdmin() || hasViewer();
export const viewerEnabled = () => hasViewer();

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Signing key: SESSION_SECRET if set, otherwise derived from the configured passwords (changing one logs everybody out). */
async function signingKey(): Promise<string> {
  const s = env("SESSION_SECRET");
  if (s.length >= 16) return s;
  return sha256(["gor-session-v2", env("APP_PASSWORD"), env("APP_PASSWORD_HASH"), env("VIEWER_PASSWORD"), env("VIEWER_PASSWORD_HASH")].join("\u0000"));
}

export async function createSession(role: Role): Promise<{ token: string; maxAge: number }> {
  const maxAge = SESSION_DAYS[role] * 86400;
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const body = `${role}.${exp}`;
  return { token: `${body}.${await hmac(await signingKey(), body)}`, maxAge };
}

export async function verifySession(token: string | undefined | null): Promise<Role | null> {
  if (!token) return null;
  const m = token.match(/^(admin|viewer)\.(\d{10})\.([0-9a-f]{64})$/);
  if (!m) return null;
  const role = m[1] as Role;
  if (Number(m[2]) * 1000 < Date.now()) return null;
  if (role === "admin" && !hasAdmin()) return null;
  if (role === "viewer" && !hasViewer()) return null;
  return safeEqual(m[3], await hmac(await signingKey(), `${m[1]}.${m[2]}`)) ? role : null;
}

// PBKDF2 hash format: pbkdf2$<iterations>$<salt base64>$<hash base64>
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, k, 256));
}
export async function hashPassword(password: string, iterations = 210000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(await pbkdf2(password, salt, iterations))}`;
}
async function matches(input: string, plain: string, hashed: string): Promise<boolean> {
  if (hashed) {
    const [kind, it, salt, h] = hashed.split("$");
    if (kind !== "pbkdf2" || !it || !salt || !h) return false;
    return safeEqual(b64(await pbkdf2(input, unb64(salt), Number(it))), h);
  }
  if (!plain) return false;
  return safeEqual(await sha256(input), await sha256(plain)); // equal-length digests → constant-time compare
}

/** Which role (if any) does this password unlock? Admin is checked first. */
export async function checkPassword(input: string): Promise<Role | null> {
  if (!input || input.length > 256) return null;
  if (await matches(input, env("APP_PASSWORD"), env("APP_PASSWORD_HASH"))) return "admin";
  if (await matches(input, env("VIEWER_PASSWORD"), env("VIEWER_PASSWORD_HASH"))) return "viewer";
  return null;
}

// ---------- route policy (shared by proxy.ts and server components)
/** Pages a viewer may open. Everything else (settings, run history, opportunity Excel builder) is admin-only. */
export function viewerMayOpenPage(pathname: string): boolean {
  return pathname === "/" || /^\/(opportunities|weekly|news|competitors)(\/|$)/.test(pathname);
}
/** APIs a viewer may call: only logout. Every data-changing or internal endpoint is admin-only. */
export function viewerMayCallApi(pathname: string, method: string): boolean {
  return pathname === "/api/auth/logout" && method === "POST";
}

/** Secure unless served over plain http on localhost (browsers drop Secure cookies there in some engines). */
export function secureCookie(req: Request) {
  const proto = (req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")).split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  return proto === "https" || !["localhost", "127.0.0.1", "::1"].includes(host);
}
