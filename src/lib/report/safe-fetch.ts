// 외부 URL 안전 다운로드 (SSRF 방어): http(s)만, 호스트 이름·DNS 결과가 사설/루프백/링크로컬이면 차단,
// 리다이렉트는 직접 따라가며 매 단계 재검사(최대 4회), 응답 크기 상한, 시간 제한.
import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { USER_AGENT } from "@/lib/util/http";
import { publicHttpUrl } from "./images";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

/** 호스트가 공개 인터넷 주소로만 해석되는지 확인. */
export async function hostIsPublic(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return !isPrivateIp(hostname);
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

export interface SafeResult { buf: Buffer; type: string; finalUrl: string }

export async function safeGetBuffer(url: string, o: { accept?: string; maxBytes: number; timeoutMs?: number }): Promise<SafeResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 15_000);
  try {
    let cur = url;
    for (let hop = 0; hop <= 4; hop++) {
      const u = publicHttpUrl(cur);
      if (!u || !(await hostIsPublic(u.hostname.replace(/^\[|\]$/g, "")))) return null;
      const res = await fetch(u, { signal: ctrl.signal, redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: o.accept ?? "*/*" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        cur = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok || !res.body) return null;
      if (Number(res.headers.get("content-length") ?? 0) > o.maxBytes) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > o.maxBytes) { ctrl.abort(); return null; }
        chunks.push(value);
      }
      return { buf: Buffer.concat(chunks), type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), finalUrl: u.toString() };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 파일 내용으로 이미지 형식 확인 (Content-Type을 믿지 않는다). */
export function sniffImage(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml" | "image/avif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("latin1", 0, 3) === "GIF") return "image/gif";
  if (buf.toString("latin1", 4, 12) === "ftypavif") return "image/avif";
  const head = buf.toString("utf8", 0, Math.min(buf.length, 600)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")) || head.includes("<svg")) return "image/svg+xml";
  return null;
}
