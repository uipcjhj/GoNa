const STOP = new Set(
  "the a an of to in on for and or with at by from as is are be its it new will has have that this into over after about than more says said us".split(" "),
);

export function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function normalizeTitle(s: string): string {
  return tokens(s.replace(/\s[-|–—]\s[^-|–—]{2,60}$/, "")).join(" ");
}

const CORP_SUFFIX =
  /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|plc|gmbh|ag|sa|s\.a|nv|bv|spa|s\.p\.a|sas|jsc|pjsc|tbk|bhd|berhad|pte|pty|kk|group|holdings?|international|industries|the)\b\.?/g;

export function normalizeCompany(s: string): string {
  if (!s || /^(unknown|not disclosed|n\/a)$/i.test(s.trim())) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,'’()&]/g, " ")
    .replace(CORP_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUnknown(s: string | null | undefined): boolean {
  return !s || /^(unknown|not disclosed|n\/a|none|-)$/i.test(s.trim());
}

export function truncate(s: string, n: number): string {
  if (!s) return s;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function containsAny(hay: string, needles: string[]): string[] {
  const h = hay.toLowerCase();
  return needles.filter((n) => {
    const k = n.toLowerCase();
    if (k.length <= 4) return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(h);
    return h.includes(k);
  });
}
