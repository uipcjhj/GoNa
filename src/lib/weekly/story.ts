// "Same story" detection across differently worded headlines (shared figures, lead entity, rare names).
import { jaccard, normalizeTitle, tokens } from "@/lib/util/text";

const GENERIC_LEAD = new Set(["美", "中", "日", "韓", "the", "a", "an", "how", "why", "new", "us", "u.s.", "정부", "국내", "글로벌", "올해", "내년", "단독", "creating", "report", "exclusive", "로이터"]);
const STOP = new Set(["공장", "증설", "투자", "신설", "물류", "센터", "생산", "물류센터", "스마트", "자동화", "로봇", "구축", "건립", "투입", "설비", "plant", "factory", "new", "invest", "investment", "expansion", "billion", "million", "warehouse", "logistics", "automation", "robot", "robots", "center", "centre", "usd", "eur", "plans", "manufacturing", "production", "facility"]);

const stem = (t: string) => (/[가-힣]/.test(t) && t.length > 2 ? t.replace(/(으로|에서|에게|은|는|이|가|을|를|의|에|로|와|과|도)$/, "") : t);
const keyTokens = (title: string) => new Set(tokens(title).map(stem).filter((t) => t.length >= 2 && !STOP.has(t)));
const figures = (s: string) => [...s.matchAll(/(\d[\d,.]*)\s?(조|억|만|billion|million|bn|m(?![a-z]))/gi)].map((m) => `${m[1].replace(/,/g, "")}${m[2][0].toLowerCase()}`);

export function leadKey(title: string): string | null {
  const t = title.replace(/^(\[[^\]]+\]|\([^)]+\))\s*/g, "").trim();
  const m = t.match(/^([A-Za-z0-9가-힣&.\-]{2,20})/);
  const k = m?.[1].replace(/(이|가|은|는|의)$/, "").toLowerCase() ?? null;
  return k && !GENERIC_LEAD.has(k) ? k : null;
}

/** Build a matcher for one pool of titles (term rarity is computed over that pool). */
export function storyMatcher(poolTitles: string[]) {
  const df = new Map<string, number>();
  for (const t of poolTitles) for (const k of keyTokens(t)) df.set(k, (df.get(k) ?? 0) + 1);
  return (a: string, b: string): boolean => {
    const sim = jaccard(normalizeTitle(a), normalizeTitle(b));
    if (sim >= 0.3) return true;
    const sa = keyTokens(a), sb = keyTokens(b);
    const leads = new Set([leadKey(a), leadKey(b)].filter((x): x is string => Boolean(x)).map(stem));
    // entity = mixed Korean+Latin names ("sk하이닉스", "쿠팡cls") or either headline's lead name; plain English words never count alone
    const shared = [...sa].filter((t) => sb.has(t));
    const entity = shared.filter((t) => (df.get(t) ?? 0) <= 4 && ((/[가-힣]/.test(t) && /[a-z]/.test(t)) || leads.has(t)));
    if (entity.length) return true;
    // two or more shared rare words (e.g. "lear" + "blueprint") also mark the same story
    if (shared.filter((t) => (df.get(t) ?? 0) <= 3 && t.length >= 4 && !/\d/.test(t)).length >= 2) return true;
    const sharedWord = [...sa].some((t) => sb.has(t) && !/\d/.test(t));
    const fa = figures(a), fb = figures(b);
    if (fa.some((f) => fb.includes(f)) && sharedWord) return true;
    const ka = leadKey(a), kb = leadKey(b);
    return Boolean(ka && ka === kb);
  };
}

// bilingual places so Korean and English headlines about the same project can be matched (e.g. KNAPP hub in Boston / 보스턴)
const PLACES: Record<string, string[]> = {
  boston: ["boston", "보스턴"], texas: ["texas", "텍사스"], georgia: ["georgia", "조지아"], ohio: ["ohio", "오하이오"], chicago: ["chicago", "시카고"], atlanta: ["atlanta", "애틀랜타"],
  dallas: ["dallas", "댈러스"], detroit: ["detroit", "디트로이트"], california: ["california", "캘리포니아"], poland: ["poland", "폴란드"], hungary: ["hungary", "헝가리"],
  netherlands: ["netherlands", "네덜란드"], germany: ["germany", "독일"], austria: ["austria", "오스트리아"], vietnam: ["vietnam", "베트남"], india: ["india", "인도"], mexico: ["mexico", "멕시코"],
  japan: ["japan", "일본"], singapore: ["singapore", "싱가포르"], uae: ["uae", "dubai", "두바이", "아랍에미리트"], australia: ["australia", "호주"],
};
export function placesOf(text: string): Set<string> {
  const t = text.toLowerCase();
  return new Set(Object.entries(PLACES).filter(([, ws]) => ws.some((w) => (/[가-힣]/.test(w) ? t.includes(w) : new RegExp(`\\b${w}\\b`).test(t)))).map(([k]) => k));
}
/** Same confirmed competitor + same (non-country) place in both headlines → same story across languages. */
export function sameCompetitorStory(a: { competitors: string[]; title: string; titleKo: string | null }, b: { competitors: string[]; title: string; titleKo: string | null }): boolean {
  if (!a.competitors.some((c) => b.competitors.includes(c))) return false;
  const pa = placesOf(`${a.title} ${a.titleKo ?? ""}`), pb = placesOf(`${b.title} ${b.titleKo ?? ""}`);
  return [...pa].some((p) => pb.has(p) && !["india", "japan", "germany", "austria", "poland", "hungary", "netherlands", "vietnam", "mexico", "singapore", "australia", "uae"].includes(p));
}
