// Deterministic checks applied to every AI report summary before it may be used in the weekly report.
// A summary that fails any check is kept for the user to review but is NOT auto-recommended or auto-exported.
//  - every amount / number / year in the summary must exist in the source text (unit conversions allowed:
//    "$1.5 billion" = "15억 달러", "413,000 sq ft" = "41.3만 sq ft")
//  - automation equipment (AGV, AMR, 자동창고, 컨베이어 …) may only appear if the source mentions it
//  - no filler lines ("업계 동향 참고", "원문 미기재", "관련 내용 언급" …), 4 distinct lines of sensible length
//  - India vs Indiana, funding round vs facility capex

/** GDELT and some feeds space out numbers: "$1 . 5 Billion" → "$1.5 Billion". */
export function normalizeNumbers(s: string): string {
  return s.replace(/(\d)\s+([.,])\s+(\d)/g, "$1$2$3").replace(/([$€£₩¥])\s+(\d)/g, "$1$2");
}

export interface Amount { value: number; currency: string | null; raw: string }

const CUR_WORD: [RegExp, string][] = [
  [/^(us\$|\$|usd|dollars?|달러|불)$/i, "USD"], [/^(€|eur|euros?|유로)$/i, "EUR"], [/^(£|gbp|pounds?|파운드)$/i, "GBP"],
  [/^(₩|krw|won|원)$/i, "KRW"], [/^(₹|rs\.?|inr|rupees?|루피)$/i, "INR"], [/^(¥|jpy|yen|엔)$/i, "JPY"], [/^(cny|rmb|yuan|위안)$/i, "CNY"],
  [/^(a\$|au\$|aud)$/i, "AUD"], [/^(c\$|cad)$/i, "CAD"], [/^(s\$|sgd)$/i, "SGD"], [/^(pln|zloty|złoty|즐로티)$/i, "PLN"], [/^(huf|forint|포린트)$/i, "HUF"],
];
const cur = (w: string | undefined) => (w ? CUR_WORD.find(([re]) => re.test(w.trim()))?.[1] ?? null : null);
const EN_MULT: Record<string, number> = { trillion: 1e12, tn: 1e12, billion: 1e9, bn: 1e9, b: 1e9, bln: 1e9, million: 1e6, mn: 1e6, m: 1e6, mln: 1e6, crore: 1e7, cr: 1e7, lakh: 1e5, thousand: 1e3, k: 1e3 };

/** Money amounts in English or Korean notation, normalised to a value + currency. */
export function amountsIn(text: string): Amount[] {
  const t = normalizeNumbers(text);
  const out: Amount[] = [];
  // English: $1.5 billion · USD 650M · €39 million · Rs 12,000 crore · 1.5 billion dollars
  const en = /(US\$|A\$|AU\$|C\$|S\$|\$|€|£|₹|¥|₩|USD|EUR|GBP|INR|JPY|KRW|CNY|AUD|CAD|SGD|PLN|HUF|Rs\.?)\s?(\d[\d,]*(?:\.\d+)?)\s?(trillion|billion|million|thousand|crore|lakh|bln|mln|bn|mn|tn|cr|[mbk])?\b(?:\s?(dollars?|euros?|pounds?|rupees?|yen|won))?|(\d[\d,]*(?:\.\d+)?)\s?(trillion|billion|million|crore|lakh|bn|mn)\b\s?(dollars?|euros?|pounds?|rupees?|yen|won|USD|EUR|INR)?/gi;
  for (const m of t.matchAll(en)) {
    const num = parseFloat((m[2] ?? m[5])!.replace(/,/g, ""));
    const mult = EN_MULT[(m[3] ?? m[6] ?? "").toLowerCase()] ?? 1;
    const c = cur(m[1]) ?? cur(m[4]) ?? cur(m[7]);
    if (Number.isFinite(num)) out.push({ value: num * mult, currency: c, raw: m[0].trim() });
  }
  // Korean: 15억 달러 · 6,000억원 · 1조 2,000억 원 · 3,000만 달러
  const ko = /(\d[\d,]*(?:\.\d+)?)\s?조(?:\s?(\d[\d,]*(?:\.\d+)?)\s?억)?\s?(원|달러|유로|파운드|엔|루피|위안)?|(\d[\d,]*(?:\.\d+)?)\s?(억|만)\s?(원|달러|유로|파운드|엔|루피|위안)?/g;
  for (const m of t.matchAll(ko)) {
    let v: number;
    let c: string | null;
    if (m[1]) {
      v = parseFloat(m[1].replace(/,/g, "")) * 1e12 + (m[2] ? parseFloat(m[2].replace(/,/g, "")) * 1e8 : 0);
      c = cur(m[3]);
    } else {
      v = parseFloat(m[4]!.replace(/,/g, "")) * (m[5] === "억" ? 1e8 : 1e4);
      c = cur(m[6]);
    }
    // "만" without a currency is a quantity (e.g. 41.3만 ft²), not money
    if (!c && m[5] === "만") continue;
    out.push({ value: v, currency: c ?? "KRW", raw: m[0].trim() });
  }
  return out;
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.015;
const sameCur = (a: Amount, b: Amount) => !a.currency || !b.currency || a.currency === b.currency || (a.currency === "KRW" && !/원|₩|krw|won/i.test(a.raw));

/** Plain numbers in a text with their scale (만 → ×10⁴, million → ×10⁶ …). */
function numbersIn(text: string): number[] {
  const t = normalizeNumbers(text);
  const out: number[] = [];
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(trillion|billion|million|thousand|crore|lakh|bn|mn|조|억|만|천|[mbk](?![a-z²]))?/gi)) {
    const n = parseFloat(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const u = (m[2] ?? "").toLowerCase();
    const mult = u === "조" ? 1e12 : u === "억" ? 1e8 : u === "만" ? 1e4 : u === "천" ? 1e3 : EN_MULT[u] ?? 1;
    out.push(n * mult, n);
  }
  return out;
}

/** Numbers / amounts / years in the summary that the source text does not contain. */
export function unsupportedNumbers(lines: string[], source: string): string[] {
  const src = normalizeNumbers(source);
  const srcAmounts = amountsIn(src);
  const srcNums = numbersIn(src);
  const srcYears = new Set(src.match(/\b(19|20)\d{2}\b/g) ?? []);
  const bad: string[] = [];
  for (const line of lines) {
    let rest = normalizeNumbers(line);
    for (const a of amountsIn(rest)) {
      if (!srcAmounts.some((s) => near(s.value, a.value) && sameCur(a, s))) bad.push(a.raw);
      rest = rest.replace(a.raw, " ");
    }
    for (const m of rest.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(조|억|만|천|%|명|대|개|곳|년|월|일|㎡|m²|ft²|sqft|평|MW|GWh|GW|톤|t\b)?/g)) {
      const raw = m[0].trim();
      const n = parseFloat(m[1]!.replace(/,/g, ""));
      if (/^(19|20)\d{2}$/.test(m[1]!) ) { if (!srcYears.has(m[1]!)) bad.push(raw); continue; }
      if (m[2] === "월" || m[2] === "일") continue; // dates are checked through the year
      const mult = m[2] === "조" ? 1e12 : m[2] === "억" ? 1e8 : m[2] === "만" ? 1e4 : m[2] === "천" ? 1e3 : 1;
      if (n <= 4 && !m[2]) continue; // "4줄", ordinals, "2세대" etc.
      if (!srcNums.some((s) => near(s, n * mult) || near(s, n))) bad.push(raw);
    }
  }
  return [...new Set(bad)];
}

// equipment / technology terms → how the source must spell them
const AUTOMATION_TERMS: [RegExp, RegExp, string][] = [
  [/AGV|무인운반/i, /\bAGVs?\b|automated guided|무인운반|AGV/i, "AGV"],
  [/AMR|자율주행 ?로봇|자율이동/i, /\bAMRs?\b|autonomous mobile|자율주행 ?로봇|자율이동|AMR/i, "AMR"],
  [/자동창고|AS\/RS|ASRS/i, /AS\/RS|ASRS|automated storage|automated warehouse|자동창고|high-bay|stacker crane/i, "자동창고"],
  [/컨베이어/i, /conveyor|컨베이어/i, "컨베이어"],
  [/소터|분류기|분류 ?설비/i, /sorter|sortation|sorting system|소터|분류기|분류 ?설비/i, "소터"],
  [/셔틀/i, /shuttle|셔틀/i, "셔틀"],
  [/\bWMS\b/i, /\bWMS\b|warehouse management system/i, "WMS"],
  [/\bWCS\b/i, /\bWCS\b|warehouse control/i, "WCS"],
  [/\bGTP\b|goods-to-person/i, /\bGTP\b|goods[- ]to[- ]person/i, "GTP"],
  [/팔레타이징|팔레타이저/i, /palleti[sz]|팔레타이/i, "팔레타이징"],
  [/피킹 ?로봇|피킹 ?시스템|자동 ?피킹/i, /pick/i, "피킹"],
  [/무인지게차|자율 ?지게차/i, /autonomous forklift|driverless forklift|automated forklift|무인지게차|자율 ?지게차/i, "무인지게차"],
  [/휴머노이드/i, /humanoid|휴머노이드/i, "휴머노이드"],
  [/로봇/i, /robot|로봇|cobot/i, "로봇"],
];
/** Automation equipment named in the summary but absent from the source. Line 4 may only use generic "자동화". */
export function unsupportedAutomation(lines: string[], source: string): string[] {
  const bad: string[] = [];
  // facts (lines 1–3) never; line 4 only as a hedged potential-demand statement ("…수요 가능성", "잠재 수요")
  const hedged = (l: string) => /(가능성|잠재|기대|여지|수요 ?전망)/.test(l);
  const checked = lines.filter((l, i) => i < 3 || !hedged(l));
  for (const [inSummary, inSource, name] of AUTOMATION_TERMS) if (checked.some((l) => inSummary.test(l)) && !inSource.test(source)) bad.push(name);
  // "자동화 설비 도입/구축" stated as fact in lines 1–3 without any automation wording in the source
  if (checked.slice(0, 3).some((l) => /자동화 ?(설비|시스템|라인)/.test(l)) && !/automat|robot|자동화|로봇/i.test(source)) bad.push("자동화 설비");
  return bad;
}

const FILLER = /(업계 ?동향 ?참고|동향 ?참고 ?필요|수요 ?동향 ?참고|참고 ?필요$|원문 ?미기재|원문 ?미확인|도입 ?여부 ?(원문 ?)?미확인|관련 ?내용 ?언급|관련 ?소식$|^\S{1,8} ?소재$|정보 ?없음|확인 ?불가|미공개$|내용 ?없음|해당 ?없음|N\/A|Unknown|Not Disclosed)/i;
export function fillerLines(lines: string[]): string[] {
  return lines.filter((l) => FILLER.test(l.trim()));
}

/** All checks; returns human-readable reasons (empty = passed). */
export function validateSummary(lines: string[], source: string, ctx: { countryKo?: string; investmentPurpose?: string } = {}): string[] {
  const reasons: string[] = [];
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length !== 4) reasons.push(`요약이 4줄이 아님 (${clean.length}줄)`);
  const short = clean.filter((l) => l.length < 10);
  const long = clean.filter((l) => l.length > 46);
  if (short.length) reasons.push(`너무 짧은 줄: ${short.join(" / ")}`);
  if (long.length) reasons.push(`너무 긴 줄 (46자 초과, 20~40자 권장) ${long.length}개`);
  if (new Set(clean).size !== clean.length || similarPairs(clean).length) reasons.push(`비슷한 내용 반복: ${similarPairs(clean).map(([a, b]) => `${a + 1}·${b + 1}줄`).join(", ") || "같은 문장"}`);
  const leaked = EXAMPLE_ENTITIES.filter((e) => clean.some((l) => l.includes(e)) && !source.includes(e));
  if (leaked.length) reasons.push(`예시 문장의 고유명사가 섞임: ${leaked.join(", ")}`);
  const nature = amountNatureIssues(clean, source);
  if (nature.length) reasons.push(...nature);
  const filler = fillerLines(clean);
  if (filler.length) reasons.push(`의미 없는 문장: ${filler.join(" / ")}`);
  if (clean.some((l) => /[§⇒•]/.test(l))) reasons.push("기호(§, ⇒ 등) 포함");
  const nums = unsupportedNumbers(clean, source);
  if (nums.length) reasons.push(`원문에 없는 수치: ${nums.join(", ")}`);
  const auto = unsupportedAutomation(clean, source);
  if (auto.length) reasons.push(`원문에 없는 자동화 설비·기술: ${auto.join(", ")}`);
  if (ctx.countryKo === "인도" && /\bIndiana\b/.test(source) && !/\bIndia\b|\bIndian\b/.test(source)) reasons.push("소재지 오류 의심: Indiana(미국)를 인도로 분류");
  if (ctx.investmentPurpose === "funding_round" && clean.some((l) => /(공장|시설|설비|센터|생산).{0,12}투자/.test(l) && amountsIn(l).length)) reasons.push("투자유치 금액을 시설 투자금액으로 표현");
  return reasons;
}

// ---------------------------------------------------------------- amount conversion / nature

const CUR_KO: Record<string, string> = { USD: "달러", EUR: "유로", GBP: "파운드", KRW: "원", INR: "루피", JPY: "엔", CNY: "위안", AUD: "호주달러", CAD: "캐나다달러", SGD: "싱가포르달러", PLN: "즐로티", HUF: "포린트" };
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** 21.5e9 USD → "215억 달러", 6.15e8 → "6.15억 달러", 3.9e7 EUR → "3,900만 유로", 1.2e12 KRW → "1조 2,000억 원". */
export function koreanAmount(value: number, currency: string | null): string {
  const unit = currency ? ` ${CUR_KO[currency] ?? currency}` : "";
  if (value >= 1e12) {
    const jo = Math.floor(value / 1e12);
    const eok = Math.round((value - jo * 1e12) / 1e8);
    return `${jo.toLocaleString("en-US")}조${eok ? ` ${eok.toLocaleString("en-US")}억` : ""}${unit}`;
  }
  if (value >= 1e8) return `${fmt(value / 1e8)}억${unit}`;
  if (value >= 1e4) return `${fmt(value / 1e4)}만${unit}`;
  return `${fmt(value)}${unit}`;
}

/** Source amounts with their Korean form — given to the model so it copies instead of converting. */
export function amountTable(source: string): { raw: string; ko: string; nature: AmountNature }[] {
  const seen = new Set<string>();
  return amountsIn(source).filter((a) => !seen.has(a.raw) && (seen.add(a.raw), true)).slice(0, 12).map((a) => ({ raw: a.raw, ko: koreanAmount(a.value, a.currency), nature: natureAt(source, a.raw) }));
}

/** Fix decimal-scale slips in Korean amounts ("$21.5 billion" written as "21.5억 달러" → "215억 달러"). */
export function fixAmountScale(lines: string[], source: string): { lines: string[]; fixes: string[] } {
  const src = amountsIn(normalizeNumbers(source));
  const fixes: string[] = [];
  const out = lines.map((line) => {
    let l = line;
    for (const a of amountsIn(normalizeNumbers(line))) {
      if (src.some((s) => near(s.value, a.value) && sameCur(a, s))) continue;
      const hit = src.find((s) => (s.currency === a.currency || !s.currency) && [10, 100, 1000, 0.1, 0.01, 0.001].some((k) => near(s.value, a.value * k)));
      if (!hit) continue;
      const right = koreanAmount(hit.value, hit.currency ?? a.currency);
      l = l.replace(a.raw, right);
      fixes.push(`금액 단위 자동 보정: ${a.raw} → ${right} (원문 ${hit.raw})`);
    }
    return l;
  });
  return { lines: out, fixes };
}

export type AmountNature = "loan" | "equity" | "valuation" | "funding" | "contract" | "capex" | "unknown";
const NATURE_SRC: [AmountNature, RegExp][] = [
  ["valuation", /valuation|valued at|value of the company|기업가치|몸값/i],
  ["loan", /\bloan|credit facility|debt|대출|융자/i],
  ["equity", /\bequity\b|own capital|자기자본|자본금/i],
  ["funding", /raise[sd]?|funding|round|series [a-h]|investors|venture|투자 ?유치|펀딩/i],
  ["contract", /contract|order|deal worth|awarded|계약|수주/i],
  ["capex", /invest|build|construct|plant|facility|factory|expan|투자|건설|증설/i],
];
/** What an amount in the source is (by the words right before/after it). */
export function natureAt(source: string, raw: string): AmountNature {
  const i = normalizeNumbers(source).indexOf(raw);
  if (i < 0) return "unknown";
  const t = normalizeNumbers(source);
  const start = Math.max(0, i - 90);
  const win = t.slice(start, i + raw.length + 60);
  const pos = i - start;
  // the keyword closest to the amount wins ("…$165 million in equity, bringing the investment amount to $615 million")
  let best: { n: AmountNature; d: number } = { n: "unknown", d: Infinity };
  for (const [n, re] of NATURE_SRC) {
    for (const m of win.matchAll(new RegExp(re.source, "gi"))) {
      const d = m.index! < pos ? pos - (m.index! + m[0].length) : m.index! - (pos + raw.length);
      if (d < best.d) best = { n, d };
    }
  }
  return best.n;
}
const NATURE_KO: [AmountNature, RegExp][] = [
  ["valuation", /기업가치|가치 ?평가|몸값/], ["loan", /대출|융자|차입/], ["equity", /자기자본|자본 ?투입|지분 ?출자/],
  ["funding", /투자 ?유치|펀딩|유치/], ["contract", /계약|수주|주문/],
];
/** Summary describes an amount as something else than the source does (valuation → 투자, loan → 투자 유치 …). */
export function amountNatureIssues(lines: string[], source: string): string[] {
  const src = amountsIn(normalizeNumbers(source));
  const issues: string[] = [];
  for (const line of lines) for (const a of amountsIn(normalizeNumbers(line))) {
    const s = src.find((x) => near(x.value, a.value) && sameCur(a, x));
    if (!s) continue;
    const n = natureAt(source, s.raw);
    const said = NATURE_KO.find(([, re]) => re.test(line))?.[0] ?? null;
    if (n === "valuation" && said !== "valuation") issues.push(`기업가치(${a.raw})를 투자·거래 금액처럼 표현`);
    else if (n === "loan" && said !== "loan" && /투자|유치/.test(line)) issues.push(`조건부 대출·융자(${a.raw})를 투자로 표현`);
    else if (n === "funding" && said !== "funding" && /(공장|시설|설비|센터|생산).{0,12}투자/.test(line)) issues.push(`투자유치(${a.raw})를 시설 투자로 표현`);
  }
  return [...new Set(issues)];
}

// ---------------------------------------------------------------- repetition / few-shot leakage
const toks = (l: string) => new Set(l.replace(/[^가-힣A-Za-z0-9]+/g, " ").split(" ").filter((w) => w.length >= 2));
export function similarPairs(lines: string[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = toks(lines[i]!), b = toks(lines[j]!);
    if (!a.size || !b.size) continue;
    let n = 0;
    for (const w of a) if (b.has(w)) n++;
    if (n / Math.min(a.size, b.size) >= 0.6) out.push([i, j]);
  }
  return out;
}
/** Proper nouns of the few-shot examples in the prompt — must never appear unless the article itself has them. */
export const EXAMPLE_ENTITIES = ["Worldpac", "포레스트파크", "AutoStore", "Logiqs", "티로보틱스", "포드에너지", "피지컬웍스", "LG CNS", "포스코DX"];
