// 잠재 발주 프로젝트 신호: 단어 하나가 아니라 "행동(신설·증설·착공…) + 시설(공장·물류센터·라인…) + 규모·자동화"의 조합으로 평가한다.
// 이미 준공·공급사 확정·부동산 거래·광고·실적 기사는 낮게, 경쟁사 수주·M&A는 별도(경쟁사 가점)로 둔다.
const ACTION_KO = /(신설|증설|착공|기공식|건립|건설|조성|구축|확장|투자|준공 ?예정|가동 ?예정|추진)/;
const FACILITY_KO = /(공장|물류센터|물류단지|물류허브|풀필먼트|창고|생산라인|생산시설|제조시설|플랜트|데이터센터|캠퍼스|산업단지|콜드체인|자동창고|스마트팩토리)/;
const ACTION_EN = /\b(build|builds|building|construct|construction|expand|expands|expansion|groundbreaking|breaks? ground|to open|will open|plans?|new|invest|invests|investment|set to)\b/i;
const FACILITY_EN = /\b(plant|factory|facility|warehouse|distribution (?:center|centre)|fulfil?lment|logistics (?:hub|park|center|centre)|gigafactory|campus|production line|manufacturing|cold (?:storage|chain)|cross-?dock|terminal)\b/i;
const SCALE = /(\d[\d,.]*\s?(?:조|억|만 ?㎡|㎡|평)|[$€£]\s?\d|\d[\d,.]*\s?(?:billion|million|bn|mn)\b|\d[\d,.]*\s?(?:sq ?ft|square (?:feet|meters?)|m²)|\d[\d,.]*\s?(?:jobs|employees))/i;
const AUTOMATION = /(자동창고|자동화|로봇|AGV|AMR|무인|AS\/RS|ASRS|shuttle|conveyor|sorter|automat|robot|autonomous|WMS|WCS|picking)/i;
const TENDER = /(입찰|발주|공고|사업자 선정|tender|RFP|procurement|request for proposal)/i;
const PRIORITY_REGION = /(폴란드|헝가리|독일|영국|베트남|태국|싱가포르|말레이시아|인도네시아|UAE|아랍에미리트|두바이|사우디|호주|Poland|Hungary|Germany|United Kingdom|\bUK\b|Vietnam|Thailand|Singapore|Malaysia|Indonesia|Saudi|Dubai|Abu Dhabi|Australia|Mexico|Canada|India)/i;
const COMPLETED = /(준공|개소|오픈했|문을 열|가동 ?시작|본격 가동|\b(?:opens|opened|inaugurates|inaugurated|officially opens|starts production|begins operations|now operational)\b)/i;
const REAL_ESTATE = /(매입|매각|임대|리츠|부동산|\b(?:buys|acquires|acquired|sells|sold|leases?|leased|REIT|portfolio)\b.{0,40}\b(?:warehouse|property|portfolio|site|building)\b)/i;
const NOISE = /(광고|캠페인|이벤트|프로모션|할인|채용|인사|부고|실적 발표|earnings call|quarterly results|stock price|share price|sponsored|press release distribution|market (?:to|will) (?:reach|hit|grow)|CAGR)/i;

const MA = /(인수|합병|\b(?:acquires?|acquisition|to buy|buys|merger|merges)\b)/i;
const LOGISTICS_AUTOMATION = /(물류|로봇|자동화|창고|robotic|robot|logistics|warehouse|automation|intralogistics|fulfil)/i;
const MFG_INDUSTRY = /(배터리|양극재|음극재|반도체|철강|화학|타이어|자동차|battery|anode|cathode|semiconductor|steel|chemical|tire|tyre|automotive|EV\b)/i;

export interface ProjectSignal { score: number; project: boolean; flags: string[] }

export function projectSignal(title: string, desc: string | null = null): ProjectSignal {
  const text = `${title} ${desc ?? ""}`;
  const head = title;
  const flags: string[] = [];
  let score = 0;
  const action = ACTION_KO.test(head) || ACTION_EN.test(head);
  const facility = FACILITY_KO.test(head) || FACILITY_EN.test(head);
  const project = action && facility;
  if (project) { score += 4; flags.push("신설·증설 프로젝트"); }
  else if (facility && (ACTION_KO.test(text) || ACTION_EN.test(text))) { score += 2; flags.push("시설 투자 언급"); }
  if (project && SCALE.test(text)) { score += 1; flags.push("규모 명시"); }
  if (AUTOMATION.test(text) && (facility || action)) { score += 1; flags.push("자동화 언급"); }
  if (TENDER.test(head) && (facility || AUTOMATION.test(text))) { score += 2; flags.push("입찰·발주"); }
  if (PRIORITY_REGION.test(head) && (project || facility)) { score += 1; flags.push("중점 지역"); }
  if (MA.test(head) && LOGISTICS_AUTOMATION.test(text)) { score += 2; flags.push("M&A(물류·로봇)"); }
  if (/(invest|investment|투자)/i.test(head) && PRIORITY_REGION.test(head) && MFG_INDUSTRY.test(head)) { score += 2; flags.push("중점 지역 제조 투자"); }
  if (COMPLETED.test(head) && !/(예정|계획|\bplans?\b|\bwill\b|\bset to\b|\bto open\b)/i.test(head)) { score -= 2; flags.push("이미 준공·가동"); }
  if (REAL_ESTATE.test(head) && !/(신설|건설|착공|build|construct)/i.test(head)) { score -= 3; flags.push("부동산 거래"); }
  if (NOISE.test(head)) { score -= 3; flags.push("광고·실적·시장전망"); }
  return { score, project, flags };
}
