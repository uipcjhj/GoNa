import type { WeeklyCategory } from "@/lib/types";

export const WEEKLY_CATEGORIES: { key: WeeklyCategory; label: string; short: string; excel: string }[] = [
  { key: "domestic", label: "국내 산업동향", short: "국내", excel: "국내 산업동향" },
  { key: "global", label: "글로벌 산업동향", short: "글로벌", excel: "글로벌 산업동향" },
  { key: "competitor", label: "경쟁사 동향", short: "경쟁사", excel: "경쟁사 동향" },
  { key: "policy", label: "정책·규제 동향", short: "정책", excel: "정책·규제 동향" },
  { key: "tech", label: "기술·시장 동향", short: "기술·시장", excel: "기술·시장 동향" },
  { key: "opportunity", label: "잠재 수주기회", short: "수주기회", excel: "잠재 수주기회" },
];

export const CAT_LABEL = Object.fromEntries(WEEKLY_CATEGORIES.map((c) => [c.key, c.label])) as Record<WeeklyCategory, string>;
export const CAT_SHORT = Object.fromEntries(WEEKLY_CATEGORIES.map((c) => [c.key, c.short])) as Record<WeeklyCategory, string>;

export const RELEVANCE_CRITERIA = [
  { key: "business", label: "현대무벡스 사업 연관성", max: 30 },
  { key: "impact", label: "업계 파급력 및 중요도", max: 25 },
  { key: "recency", label: "최신성", max: 20 },
  { key: "strategic", label: "전략지역·산업 관련성", max: 15 },
  { key: "credibility", label: "근거의 신뢰성", max: 10 },
] as const;

// keyword dictionaries (Korean + English); matched case-insensitively on title + description/body
export const KW = {
  business: [
    "물류자동화", "물류 자동화", "자동창고", "자동화창고", "스마트물류", "물류로봇", "물류 로봇", "AMR", "AGV", "AS/RS", "ASRS", "셔틀 시스템", "셔틀 랙", "컨베이어", "소터", "분류기",
    "WMS", "WCS", "WES", "풀필먼트", "물류센터", "로봇 도입", "로봇 자동화", "자동화 설비", "공정 자동화", "제조 자동화", "자동화 라인", "스마트팩토리", "스마트공장", "공정물류", "생산물류", "콜드체인", "냉동창고", "냉장창고", "수하물", "승강장 안전문", "스크린도어",
    "warehouse automation", "automated warehouse", "intralogistics", "material handling", "conveyor", "sorter", "shuttle", "automated storage", "fulfillment center", "fulfilment centre",
    "distribution center", "distribution centre", "cold storage", "baggage handling", "cargo handling", "palletizing", "picking robot", "mobile robot", "smart factory",
  ],
  facilityInvest: [
    "신설", "증설", "착공", "준공", "투자", "공장", "건립", "확장", "new plant", "new factory", "expansion", "invest", "groundbreaking", "construction", "gigafactory", "new facility",
  ],
  policy: [
    "정부", "정책", "지원사업", "지원 사업", "예산", "법안", "개정안", "시행령", "시행규칙", "고시", "규제", "규정", "보조금", "인센티브", "관세", "국토교통부", "국토부", "산업통상자원부", "산업부", "해양수산부",
    "중소벤처기업부", "중기부", "과학기술정보통신부", "과기정통부", "기획재정부", "지자체", "공고", "로드맵",
    "government", "ministry", "regulation", "regulatory", "policy", "subsidy", "incentive", "tariff", "legislation", "bill ", " act ", "federal", "grant program", "standard",
  ],
  policyIndustry: [
    "물류", "제조", "로봇", "자동화", "공급망", "스마트공장", "스마트팩토리", "산업단지", "인프라", "창고", "배터리", "자동차", "AI",
    "logistics", "manufactur", "robot", "automation", "supply chain", "warehouse", "industrial", "factory", "infrastructure",
  ],
  tech: [
    "WMS", "WCS", "WES", "AS/RS", "셔틀", "AMR", "AGV", "물류로봇", "피지컬 AI", "피지컬AI", "디지털트윈", "디지털 트윈", "휴머노이드", "AI 기반", "자율주행 로봇", "시장 규모", "시장 전망", "시장조사",
    "physical AI", "digital twin", "humanoid", "market size", "market report", "forecast", "robotics", "machine vision", "autonomous mobile", "software", "AI-powered", "warehouse execution",
  ],
  promo: ["출시", "신제품", "선보", "launches", "unveils", "introduces", "now available"],
  industry: {
    "물류자동화": ["물류자동화", "물류센터", "풀필먼트", "자동창고", "warehouse", "logistics", "fulfil", "distribution cent"],
    "스마트팩토리": ["스마트팩토리", "스마트공장", "제조자동화", "smart factory", "factory automation"],
    "자동차": ["자동차", "완성차", "자동차 부품", "automotive", "automaker", "vehicle"],
    "배터리": ["배터리", "이차전지", "2차전지", "양극재", "battery", "gigafactory", "cathode"],
    "타이어": ["타이어", "tire", "tyre"],
    "식음료": ["식품", "음료", "food", "beverage", "brewery", "dairy"],
    "냉동냉장": ["콜드체인", "냉동", "냉장", "cold chain", "cold storage", "refrigerated"],
    "석유화학": ["석유화학", "화학", "petrochemical", "chemical"],
    "이커머스·유통": ["이커머스", "유통", "쿠팡", "e-commerce", "ecommerce", "retail"],
    "공항물류": ["공항", "수하물", "항공화물", "airport", "air cargo", "baggage"],
    "철도·승강장": ["철도", "승강장", "스크린도어", "railway", "metro"],
    "로봇·피지컬AI": ["로봇", "피지컬 AI", "휴머노이드", "robot", "humanoid", "physical ai"],
  } as Record<string, string[]>,
  noise: ["주가", "증시", "코스피", "코스닥", "연예", "드라마", "축구", "야구", "선거", "대통령실", "부고", "stock price", "shares rose", "shares fell", "earnings call", "football", "celebrity"],
  logisticsContext: ["물류", "자동화", "창고", "로봇", "logistic", "automation", "warehouse", "intralogistics", "material handling", "conveyor", "sorting", "storage", "airport", "baggage", "distribution"],
};

// Competitor alias rules: names that are also common surnames/words need logistics context (and exact case)
export const COMPETITOR_RULES: Record<string, { ko: string[]; caseSensitive?: string[] }> = {
  Daifuku: { ko: ["다이후쿠"] },
  Dematic: { ko: ["데마틱"] },
  "SSI Schäfer": { ko: ["SSI쉐퍼", "SSI 쉐퍼", "에스에스아이쉐퍼"], caseSensitive: ["SSI Schäfer", "SSI Schaefer", "SSI SCHÄFER", "SSI SCHAEFER"] },
  KNAPP: { ko: ["크납"], caseSensitive: ["KNAPP"] },
  Vanderlande: { ko: ["반더란데", "반데란데"] },
  Swisslog: { ko: ["스위스로그"] },
  TGW: { ko: [], caseSensitive: ["TGW Logistics", "TGW"] },
};
