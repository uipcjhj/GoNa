// Query plan for weekly scraping. Order matters: direct publisher feeds first (real URLs + dates),
// then Google News (Korean & English) restricted to the target dates, then GDELT for global coverage.
import type { PlannedQuery, Settings } from "@/lib/types";

export interface WeeklyRange { start: string; end: string; startDate: string; endDate: string; days?: string[] }

const enc = (o: object) => JSON.stringify(o);

// Extra detail queries aligned with the report taxonomy (국내 세부 카테고리 · 글로벌 국가/시설 유형) — Google News only (reliable).
const DETAIL_KO = [
  "물류센터 착공 OR 준공 OR 개소", "자동화 물류센터 구축", "스마트팩토리 구축 OR 제조 자동화 도입", "공장 증설 투자 설비 자동화", "무인지게차 OR 물류로봇 도입", "피지컬 AI 로봇 물류 OR 제조 실증",
  "서비스로봇 OR 배송로봇 OR 휴머노이드 상용화", "항만 자동화 OR 스마트항만 구축", "공항 화물 OR 수하물 자동화", "콜드체인 센터 신설", "배터리 공장 신설 OR 증설", "반도체 공장 투자 클린룸 물류",
  "자동차 부품 공장 투자", "식품 공장 신설 자동화", "로봇 수주 OR 자동화 설비 수주", "물류 자동화 솔루션 공급 계약", "물류 스타트업 투자유치 OR 인수", "스마트물류 국책과제 OR 정부 지원 로봇",
];
const DETAIL_EN: [string, string][] = [
  ["United States", "warehouse automation OR distribution center OR automated fulfillment"], ["United States", "manufacturing plant investment OR new factory"],
  ["Canada", "distribution center OR fulfillment automation"], ["Mexico", "plant OR nearshoring factory investment"],
  ["Germany", "intralogistics OR automated warehouse OR logistics center"], ["Netherlands OR Belgium", "distribution center automation OR AS/RS"], ["United Kingdom", "automated warehouse OR fulfilment centre"],
  ["France OR Spain OR Italy", "logistics hub OR warehouse automation OR factory investment"], ["Poland OR Hungary OR Czech OR Romania", "new factory OR logistics park OR warehouse automation"],
  ["Vietnam OR Thailand OR Indonesia OR Malaysia", "factory investment OR logistics center OR smart warehouse"], ["Singapore", "automated warehouse OR logistics hub"],
  ["India", "plant expansion OR warehouse automation OR logistics park"], ["China", "automated warehouse OR robotics logistics OR smart factory"], ["Japan", "logistics automation OR warehouse robots OR automated warehouse"],
  ["Saudi Arabia OR UAE OR Qatar", "logistics hub OR warehouse OR factory"], ["Australia OR New Zealand", "distribution centre automation OR warehouse"], ["Brazil OR Chile", "distribution center OR plant investment automation"],
  ["", "cold chain automated storage OR cold storage facility automation"], ["", "humanoid robot warehouse OR physical AI logistics deployment"], ["", "AutoStore OR Symbotic OR Exotec OR \"Hai Robotics\" OR \"Geek+\" contract OR launch"],
];

// 공식 소스: 투자청·정부 발표와 경쟁사 공식 뉴스룸. Google News의 site: 검색(공개 RSS)으로 발행처 도메인과 날짜를 그대로 받는다 — 우회·스크래핑 없음.
const OFFICIAL: { label: string; q: string }[] = [
  { label: "투자청 · 폴란드·헝가리·독일", q: "(site:paih.gov.pl OR site:hipa.hu OR site:gtai.de) (logistics OR warehouse OR factory OR plant OR automation OR investment)" },
  { label: "투자청 · 싱가포르·말레이시아·태국", q: "(site:edb.gov.sg OR site:mida.gov.my OR site:boi.go.th) (logistics OR warehouse OR factory OR plant OR automation OR investment)" },
  { label: "투자청 · 인도네시아·베트남·인도", q: "(site:investindonesia.go.id OR site:mpi.gov.vn OR site:investindia.gov.in) (logistics OR warehouse OR factory OR plant OR investment)" },
  { label: "투자청 · 사우디·호주·영국", q: "(site:misa.gov.sa OR site:austrade.gov.au OR site:great.gov.uk) (logistics OR warehouse OR factory OR plant OR investment)" },
  { label: "경쟁사 뉴스룸 · 유럽", q: "(site:knapp.com OR site:swisslog.com OR site:ssi-schaefer.com OR site:dematic.com OR site:tgw-group.com OR site:jungheinrich.com OR site:kardex.com) (press OR news OR order OR contract OR innovation)" },
  { label: "경쟁사 뉴스룸 · 글로벌", q: "(site:autostoresystem.com OR site:daifuku.com OR site:exotec.com OR site:symbotic.com OR site:hairobotics.com OR site:geekplus.com) (press OR news OR order OR contract OR launch)" },
];
// 중점 지역 영어판(GB·AU·SG·MY·IN) — 현지 매체를 우선 노출
const CORE = '(warehouse OR \"distribution centre\" OR \"logistics park\" OR \"automated warehouse\" OR \"new factory\" OR \"manufacturing plant\")';
const SIG = '(automation OR investment OR expansion OR construction)';
const NEG = '  -nuclear -reactor -\"power plant\" -solar -telecom'; // keep out nuclear / power plants / telecom noise
const EDITIONS: { edition: string; where: string; q: string }[] = [
  { edition: "GB", where: "영국", q: "%s %s%s" },
  { edition: "AU", where: "호주", q: "%s %s%s" },
  { edition: "SG", where: "싱가포르·동남아", q: "%s %s (Singapore OR Vietnam OR Thailand OR Indonesia OR Malaysia)%s" },
  { edition: "MY", where: "말레이시아", q: "%s %s%s" },
  { edition: "IN", where: "인도", q: "%s %s%s" },
].map((e) => {
  const parts = [CORE, SIG];
  let k = 0;
  return { ...e, q: e.q.replace(/%s/g, () => (k < 2 ? parts[k++]! : NEG)) };
});

export function planWeeklyQueries(s: Settings, range: WeeklyRange): PlannedQuery[] {
  const w = s.weekly;
  const plan: PlannedQuery[] = [];
  const dayWindows = range.days?.length ? range.days.map((d) => ({ startDate: d, endDate: d })) : [{ startDate: range.startDate, endDate: range.endDate }];

  // 1) publisher RSS feeds (only return recent items; date filtering happens on storage)
  if (!range.days?.length) {
    for (const f of s.rssFeeds.filter((f) => f.enabled)) {
      plan.push({ provider: "rss", query: f.url, label: `RSS · ${f.name}` });
    }
  }

  // 2) Google News RSS (free, Korean + English), restricted to each window
  if (w.googleNews) {
    const ko = (list: string[], cat: string) => list.forEach((q) => dayWindows.forEach((d) => plan.push({ provider: "googlenews", query: enc({ q, lang: "ko", ...d }), label: `Google News(국문) · ${cat} · ${q}${range.days?.length ? ` · ${d.startDate}` : ""}` })));
    const en = (list: string[], cat: string) => list.forEach((q) => dayWindows.forEach((d) => plan.push({ provider: "googlenews", query: enc({ q, lang: "en", ...d }), label: `Google News(영문) · ${cat} · ${q}${range.days?.length ? ` · ${d.startDate}` : ""}` })));
    const comps = s.competitors.filter((c) => c.enabled);
    // missing-day re-search uses a smaller core set to stay polite
    const core = (list: string[], n: number) => (range.days?.length ? list.slice(0, n) : list);
    ko(core(w.domesticQueries, 4), "국내");
    ko(core(w.competitorQueriesKo, 1), "경쟁사");
    ko(core(w.policyQueriesKo, 2), "정책");
    ko(core(w.techQueriesKo, 1), "기술");
    en(core(w.globalQueries, 4), "글로벌");
    en(core(comps.map((c) => `"${c.aliases[0] ?? c.name}" (warehouse OR logistics OR automation OR contract)`), 2), "경쟁사");
    en(core(w.policyQueriesEn, 1), "정책");
    en(core(w.techQueriesEn, 1), "기술");
    // official sources first among the extras: investment agencies / government releases / competitor newsrooms, regional English editions
    if (!range.days?.length) {
      OFFICIAL.forEach((o) => dayWindows.forEach((d) => plan.push({ provider: "googlenews", query: enc({ q: o.q, lang: "en", ...d }), label: `Google News(공식) · ${o.label}` })));
      EDITIONS.forEach((e) => dayWindows.forEach((d) => plan.push({ provider: "googlenews", query: enc({ q: e.q, lang: "en", edition: e.edition, ...d }), label: `Google News(${e.edition}판) · ${e.where}` })));
    }
    // taxonomy-aligned detail queries (skipped for the small missing-day re-search)
    if (!range.days?.length) {
      ko(DETAIL_KO, "국내 세부");
      DETAIL_EN.forEach(([where, what]) => en([`(${what})${where ? ` (${where.split(" OR ").map((x) => `"${x}"`).join(" OR ")})` : ""}`], where ? `글로벌 · ${where.split(" OR ")[0]}` : "글로벌 세부"));
    }
  }

  // 3) GDELT (global, English) with an explicit date window (GDELT DOC API covers ~3 months)
  const ageDays = (Date.now() - new Date(range.start).getTime()) / 86400_000;
  if (w.gdelt && !range.days?.length && ageDays < 85) {
    for (const q of w.globalQueries.slice(0, 6)) {
      const gq = q.split(" OR ").length > 1 ? q.replace(/(\S+ OR \S+(?: OR \S+)*)/, "($1)") : q;
      plan.push({ provider: "gdelt", query: enc({ q: gq, start: range.start, end: range.end }), label: `GDELT · 글로벌 · ${q}` });
    }
  }
  return plan;
}
