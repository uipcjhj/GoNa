// Simple shared-password access control for internal use (enabled when APP_PASSWORD is set).
export const SESSION_COOKIE = "gor_session";

export const authEnabled = () => Boolean(process.env.APP_PASSWORD);

export async function sessionToken(): Promise<string> {
  const pw = process.env.APP_PASSWORD ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("gor-session-v1"));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
