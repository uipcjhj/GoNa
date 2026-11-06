import { createHash } from "node:crypto";

const TRACKING = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ocid|cmpid|ref|ref_src|src|sr_share|smid|mod|taid|ito|ncid)/i;

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "").replace(/^amp\./, "");
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (!TRACKING.test(k)) keep.append(k, v);
    u.search = keep.toString() ? `?${keep.toString()}` : "";
    let p = u.pathname.replace(/\/amp\/?$/, "/").replace(/\/+$/, "");
    if (!p) p = "/";
    u.pathname = p;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export function hashId(s: string, len = 16): string {
  return createHash("sha256").update(s).digest("hex").slice(0, len);
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
