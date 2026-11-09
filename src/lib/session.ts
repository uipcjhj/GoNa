import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, authEnabled, verifySession, type Role } from "@/lib/auth";

/** Role of the current request (server components / route handlers). No auth configured → local admin. */
export async function currentRole(): Promise<Role | null> {
  if (!authEnabled()) return "admin";
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function isAdmin(): Promise<boolean> {
  return (await currentRole()) === "admin";
}
/** Route-handler guard (second layer behind proxy.ts). Returns a 403 response for non-admins. */
export async function requireAdmin(): Promise<Response | null> {
  return (await isAdmin()) ? null : Response.json({ error: "관리자 전용 기능입니다." }, { status: 403 });
}
