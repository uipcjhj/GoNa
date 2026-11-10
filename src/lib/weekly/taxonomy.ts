// 현대무벡스 주간 업계동향 실무 분류체계 + 내부 판단 항목 + 보고서용 4줄 요약 (규칙 기반).
// AI (Gemini/Claude) supplies the same fields when connected; these rules are the free fallback and fill gaps
// for older records. Only facts found in the title/excerpt are used; inference is labelled as such.
import type { Article, DetailCategory, Opportunity, WeeklyAnalysis, WeeklyJudgment } from "@/lib/types";
import { normalizeNumbers } from "@/lib/report/validate";

export const TAXONOMY = {
  global: { label: "글로벌시장", subs: ["투자·확장", "제조물류 투자", "스마트창고 투자", "콜드체인 투자", "자동화 운영확대", "Industry"] },
  domestic: { label: "국내시장", subs: ["투자·확장", "스마트팩토리", "제조자동화", "자율물류", "피지컬 AI", "정책·지원", "항만자동화", "Industry"] },
  competitor: { label: "경쟁사", subs: ["수주·계약", "사업전략", "M&A·사업확장", "제품·솔루션 공개", "실증·도입", "R&D·피지컬 AI", "국내시장 진출"] },
} as const;

export const REVIEW_LABEL = "확인 필요";

export const COUNTRY_KO: Record<string, string> = {
  "United States": "미국", Canada: "캐나다", Mexico: "멕시코", Poland: "폴란드", Hungary: "헝가리", "Czech Republic": "체코", Slovakia: "슬로바키아", Romania: "루마니아",
  Germany: "독일", "United Kingdom": "영국", France: "프랑스", Spain: "스페인", Italy: "이탈리아", Netherlands: "네덜란드", Belgium: "벨기에", Sweden: "스웨덴", Austria: "오스트리아",
  Vietnam: "베트남", Thailand: "태국", Singapore: "싱가포르", Indonesia: "인도네시아", Malaysia: "말레이시아", Philippines: "필리핀", India: "인도",
  "United Arab Emirates": "UAE", "Saudi Arabia": "사우디", Qatar: "카타르", Oman: "오만", Israel: "이스라엘", Turkey: "튀르키예", Egypt: "이집트",
  Australia: "호주", "New Zealand": "뉴질랜드", Japan: "일본", China: "중국", Taiwan: "대만", Brazil: "브라질", Chile: "칠레", "South Africa": "남아공",
};

export function labelOf(d: Omit<DetailCategory, "label">): string {
  if (d.group === "review") return REVIEW_LABEL;
  if (d.group === "global") return `${TAXONOMY.global.label}${d.country ? `(${d.country})` : ""} / ${d.sub}`;
  return `${TAXONOMY[d.group].label} / ${d.sub}`;
}

/** All selectable labels (for the editor dropdown). Global labels are offered without country; the country is kept per article. */
export function allLabels(): string[] {
  return [
    ...TAXONOMY.global.subs.map((s) => `글로벌시장 / ${s}`),
    ...TAXONOMY.domestic.subs.map((s) => `국내시장 / ${s}`),
    ...TAXONOMY.competitor.subs.map((s) => `경쟁사 / ${s}`),
    REVIEW_LABEL,
  ];
}

const has = (text: string, re: RegExp) => re.test(text);

// ---- signal dictionaries
const RE = {
  invest: /(신설|증설|착공|건립|투자|투입|확장|구축|도입|짓|조성|건설|invest|build|construct|expan|new (plant|factory|facility|warehouse|distribution|fulfil)|break(s)? ground|groundbreaking|to open|plans?\b|capacity)/i,
  completed: /(준공|개소|오픈했|문을 열|가동(을)? 시작|가동에 들어|본격 가동|\bopens\b|\bopened\b|inaugurat|begins operations|started operations|now operational|officially (launch|open))/i,
  future: /(예정|계획|추진|목표|착공|will|plans?|to open|set to)/i,
  cold: /(콜드체인|냉동|냉장|저온|cold (chain|storage)|refrigerat|frozen)/i,
  warehouse: /(물류센터|물류창고|창고|풀필먼트|자동창고|물류허브|물류단지|warehouse|distribution (center|centre)|fulfil?ment|logistics (hub|park|center|centre)|dc\b)/i,
  plant: /(공장|생산라인|생산시설|생산기지|제조시설|부품공장|plant|factory|manufactur|production line|gigafactory|assembly)/i,
  automationDeploy: /(자동화 (확대|도입|적용)|로봇 (도입|확대|배치)|deploy|roll(s|ing)? out|expands? (use|automation|robot)|automat(es|ed fulfil)|adopts?)/i,
  automationWords: /(자동창고|AS\/RS|ASRS|셔틀|AGV|AMR|무인지게차|컨베이어|소터|분류기|피킹|팔레타이징|WMS|WCS|WES|GTP|로봇|자동화|conveyor|sorter|shuttle|robot|automat|picking|palletiz|storage and retrieval)/i,
  smartFactory: /(스마트팩토리|스마트공장|제조 ?AX|AX 전환|smart factory)/i,
  mfgAutomation: /(제조 ?자동화|공정 ?자동화|생산 ?자동화|자동화 라인|자동화 설비|로봇 자동화)/i,
  autonomous: /(자율물류|자율주행 (로봇|물류)|AMR|AGV|무인지게차|무인운반|물류로봇|물류 로봇)/i,
  physicalAI: /(피지컬 ?AI|휴머노이드|physical ai|humanoid)/i,
  port: /(항만|스마트항만|컨테이너 터미널|부두|port automation|container terminal)/i,
  policy: /(정부|정책|지원사업|지원 사업|예산|법안|개정|시행|고시|규제|보조금|국토교통부|국토부|산업통상|산업부|해양수산부|해수부|중기부|중소벤처기업부|과기정통부|지자체|공고)/,
  contract: /(수주|공급 계약|계약 체결|낙찰|선정|공급한다|공급키로|납품|contract|wins?\b|won\b|selects?|selected|order|awarded|partner(s|ship)? with|deal)/i,
  ma: /(인수|합병|지분 투자|투자 유치|acquire|acquisition|merger|takeover|stake|raises?|funding|IPO|상장)/i,
  product: /(출시|공개|선보|론칭|신제품|launch|unveil|introduc|debut|new (robot|system|solution))/i,
  pilot: /(실증|시범|PoC|도입 사례|구축 사례|파일럿|pilot|trial|deploy|case study|go-?live|goes live)/i,
  rnd: /(R&D|연구개발|연구소|AI|피지컬|휴머노이드|research|humanoid|physical ai)/i,
  koreaEntry: /(한국 (진출|시장)|국내 (진출|시장 공략|법인)|Korea(n)? (market|entry|office))/i,
  realEstate: /(매입|매각|임대|리츠|부동산|lease[ds]?|leasing|acquires? (a |the )?(warehouse|portfolio|property|site)|sells? (warehouse|portfolio)|real estate|REIT)/i,
  exhibition: /(전시회|박람회|엑스포|컨퍼런스 개최|expo\b|exhibition|trade show|\bshow 20\d\d)/i,
  rndCenter: /(R&D ?센터|연구소 개소|연구센터|innovation (center|centre|hub) open|R&D (center|centre))/i,
  mou: /(MOU|업무협약|양해각서|협약 체결|memorandum)/i,
  outlook: /(시장 (전망|규모|동향)|전망|outlook|forecast|market size|survey|report finds|statistics|통계)/i,
  event: /(간담회|세미나|포럼|컨퍼런스|설명회|협의회|토론회|행사|기념식|webinar|conference|summit|forum)/i,
  award: /(표창|수상|시상|선정 기업|인증 획득|award|wins? .*award|recognized|honou?red)/i,
  earnings: /(실적|매출|영업이익|순이익|적자|흑자|분기|earnings|revenue|quarterly|profit|loss)/i,
  tender: /(입찰|발주|공고|사업자 선정|RFP|tender|procurement|bid)/i,
  // not a production / warehouse project even if "manufacturing" or "invest" appears
  nonFacility: /(research|R&D|\blab\b|laborator|innovation (hub|center|centre)|technology (center|centre)|tech center|engineering center|organi[sz]ation|new (division|unit|team|department)|robotics (division|unit|team|organi[sz]ation)|연구소|연구센터|기술센터|조직 ?(신설|개편)|사업부 ?신설|전담 ?조직)/i,
  advert: /(campaign|diwali|festive|festival offer|advert|\bad film\b|\bTVC\b|brand ambassador|commercial (film|spot)|광고|캠페인|브랜드 모델|홍보대사)/i,
  funding: /(raises?|raised|funding|series [a-h]\b|valuation|venture|investors? led|투자 ?유치|시리즈 ?[A-H])/i,
  constructionCo: /(시공사|건설사|시공|general contractor|construction (firm|company) (selected|named))/i,
};

function bodyOf(a: Article) {
  // "셔틀버스" (shuttle bus) is not shuttle automation
  return normalizeNumbers(`${a.title}\n${a.excerpt ?? ""}`).replace(/셔틀\s?버스|shuttle bus(es)?/gi, "버스");
}

/** Hierarchical category by rules. */
export function detailByRules(a: Article, w: WeeklyAnalysis): DetailCategory {
  const text = bodyOf(a);
  const confirmed = (w.competitorChecks ?? []).filter((c) => c.confirmed);
  const countryKo = w.country && w.country !== "Unknown" && w.country !== "South Korea" ? COUNTRY_KO[w.country] ?? w.country : null;
  let d: Omit<DetailCategory, "label">;

  if (confirmed.length) {
    const sub = has(text, RE.contract) ? "수주·계약"
      : has(text, RE.koreaEntry) ? "국내시장 진출"
      : has(text, RE.ma) ? "M&A·사업확장"
      : has(text, RE.product) ? "제품·솔루션 공개"
      : has(text, RE.pilot) ? "실증·도입"
      : has(text, RE.physicalAI) || /R&D|연구개발/.test(text) || has(a.title, RE.nonFacility) ? "R&D·피지컬 AI"
      : "사업전략";
    d = { group: "competitor", country: null, sub };
  } else if (w.scope === "domestic") {
    const sub = w.categories.includes("policy") && has(text, RE.policy) ? "정책·지원"
      : has(text, RE.port) ? "항만자동화"
      : has(text, RE.physicalAI) ? "피지컬 AI"
      : has(text, RE.autonomous) ? "자율물류"
      : has(text, RE.smartFactory) ? "스마트팩토리"
      : has(text, RE.mfgAutomation) ? "제조자동화"
      : has(text, RE.invest) && !has(a.title, RE.nonFacility) && !has(a.title, RE.funding) && (has(text, RE.warehouse) || has(text, RE.plant)) ? "투자·확장"
      : "Industry";
    d = { group: "domestic", country: null, sub };
  } else {
    const investing = has(text, RE.invest) && !has(a.title, RE.nonFacility) && !has(a.title, RE.funding) && !has(text, RE.advert);
    const sub = has(text, RE.cold) && investing ? "콜드체인 투자"
      : has(text, RE.automationDeploy) && has(text, RE.automationWords) ? "자동화 운영확대"
      : has(text, RE.warehouse) && investing ? "스마트창고 투자"
      : has(text, RE.plant) && investing ? "제조물류 투자"
      : investing && (has(text, RE.warehouse) || has(text, RE.plant)) ? "투자·확장"
      : "Industry";
    d = { group: "global", country: sub === "Industry" ? null : countryKo, sub };
  }
  // relevance too weak to place the article confidently → 확인 필요
  if (!w.primaryCategory || (w.relevance < 30 && d.group !== "competitor")) d = { group: "review", country: null, sub: REVIEW_LABEL };
  return { ...d, label: labelOf(d) };
}

/** Internal judgment items by rules (title + excerpt only, so the basis is recorded). */
export function judgmentByRules(a: Article, w: WeeklyAnalysis, d: DetailCategory, opp: Opportunity | null): WeeklyJudgment {
  const text = bodyOf(a);
  const confirmed = (w.competitorChecks ?? []).filter((c) => c.confirmed);
  const completed = has(a.title, RE.completed) && !/(예정|계획|추진|목표|will|plans?|set to)/i.test(a.title);
  const automationMentioned = has(text, RE.automationWords);
  const facility = (has(text, RE.warehouse) || has(text, RE.plant) || has(text, RE.port)) && !has(a.title, RE.nonFacility) && !has(text, RE.advert);
  const isNewProject = has(text, RE.invest) && facility && !completed ? true : completed ? false : null;

  // supplier: only "decided" when the article names an automation vendor contract; construction firm ≠ automation supplier
  let supplierStatus: WeeklyJudgment["supplierStatus"] = "unknown";
  let supplierNote = "원문에서 자동화 공급사 정보 확인 불가";
  if (confirmed.length && has(text, RE.contract)) {
    supplierStatus = "decided";
    supplierNote = `${confirmed.map((c) => c.name).join(", ")} 공급·수주 언급 (원문)`;
  } else if (has(text, RE.tender) && automationMentioned) {
    supplierStatus = "undecided";
    supplierNote = "입찰·발주 단계 언급 — 자동화 공급사 미확정 (원문)";
  } else if (isNewProject && !automationMentioned) {
    supplierStatus = "order_unconfirmed";
    supplierNote = "자동화 설비 도입·발주 여부 원문 미기재";
  }
  if (has(text, RE.constructionCo) && supplierStatus !== "decided") supplierNote += " · 시공사 선정은 자동화 공급사 선정과 별개";

  const investTitle = has(a.title, /(신설|증설|건설|착공|투자|건립|build|construct|invest|expan)/i);
  const lowValueType = has(text, RE.advert) ? "광고·홍보"
    : has(a.title, RE.funding) && !has(a.title, /(공장|plant|factory|facility|warehouse|센터)/i) ? "투자유치(펀딩) — 시설 투자 아님"
    : has(text, RE.realEstate) && !has(a.title, /(신설|건설|착공|build|construct)/i) ? "물류부동산 매입·매각·임대"
    : has(text, RE.exhibition) ? "전시회·행사"
    : has(a.title, RE.award) && !investTitle ? "수상·표창"
    : has(a.title, RE.event) && !investTitle ? "간담회·행사"
    : has(a.title, RE.earnings) && !investTitle ? "실적 발표"
    : has(text, RE.rndCenter) || has(a.title, RE.nonFacility) ? "R&D센터·연구소·조직 신설"
    : has(a.title, RE.mou) && !has(text, /(\d[\d,.]*\s?(억|조)|\$\s?\d|billion|million)/i) ? "실투자 근거 부족한 MOU"
    : has(a.title, RE.product) && !confirmed.length ? "제품 출시 중심"
    : has(a.title, RE.outlook) && !isNewProject ? "시장 전망·통계"
    : null;

  const orderRoom: WeeklyJudgment["orderRoom"] = completed || supplierStatus === "decided" ? "no" : isNewProject && !lowValueType ? "yes" : "unknown";
  const biz = w.relevanceBreakdown?.business.score ?? 0;
  const directRelevance: WeeklyJudgment["directRelevance"] = biz >= 20 || (automationMentioned && facility) ? "high" : biz >= 10 || facility ? "medium" : "low";
  const competitorValue: WeeklyJudgment["competitorValue"] = !confirmed.length ? "none"
    : ["수주·계약", "M&A·사업확장", "국내시장 진출"].includes(d.sub) ? "high" : ["실증·도입", "사업전략", "R&D·피지컬 AI"].includes(d.sub) ? "medium" : "low";
  const oppScore = opp?.score ?? a.analysis?.score ?? 0;
  const winPotential: WeeklyJudgment["winPotential"] = orderRoom === "yes" && directRelevance !== "low" && (oppScore >= 55 || automationMentioned) ? "high"
    : orderRoom === "yes" || (isNewProject && !completed) ? "medium" : "low";

  return { winPotential, isNewProject, completed, supplierStatus, supplierNote, orderRoom, directRelevance, competitorValue, lowValueType, basis: a.analysis && a.excerpt && a.excerpt.length > 120 ? "body" : "title_only", automationMentioned };
}

// ---- 4-line report summary: NOT generated by rules any more.
// Template sentences ("관련 소식", "업계 동향 참고", "원문 미기재", "$1 규모" …) were misleading in the company report,
// so report summaries now come only from the validated Gemini analysis (lib/report/factcheck) or the user's own edit.

/** Fill the v2 fields (preliminary category hierarchy + judgments) by rules. No report summary is generated here. */
export function withV2(a: Article, w: WeeklyAnalysis, opp: Opportunity | null): WeeklyAnalysis {
  const detail = w.detail ?? detailByRules(a, w);
  const judgment = w.judgment ?? judgmentByRules(a, w, detail, opp);
  return { ...w, detail, judgment, summary4: [], summary4Basis: undefined };
}

export const SUPPLIER_LABEL: Record<WeeklyJudgment["supplierStatus"], string> = {
  undecided: "자동화 공급사 미확정", decided: "자동화 공급사 확정", unknown: "공급사 확인 불가", order_unconfirmed: "자동화 발주 여부 미확인",
};
export const LEVEL_LABEL = { high: "높음", medium: "중간", low: "낮음", none: "해당 없음" } as const;
export const ORDER_ROOM_LABEL = { yes: "있음 (추정)", no: "낮음", unknown: "미확인" } as const;
