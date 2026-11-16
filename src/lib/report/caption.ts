// 이미지 한 줄 캡션 규칙 (순수 함수): 한국어 명사형·명사구, 15~40자 내외, 마침표 없음, 기사 제목 반복 금지.
export const CAPTION_MIN = 8, CAPTION_MAX = 45;
export const NEEDS_CAPTION = "설명 확인 필요";

const SENTENCE_END = /(다|요|니다|습니다|했음|됨|함|있음|임|예정이다|할 것이다)$/;

export function normalizeCaption(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/^["'“”‘’「」『』\-–·•▲△▶▷■□●○◆◇※*\s]+/, "").replace(/["'“”‘’「」『』.。!?\s]+$/g, "").trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");

/** 문체·길이·제목 반복·근거 없는 숫자를 검사한다. 통과하면 { ok: true }. */
export function checkCaption(c: string, o: { title?: string; allowedText?: string } = {}): { ok: boolean; reason?: string } {
  const t = c.trim();
  if (!/[가-힣]/.test(t)) return { ok: false, reason: "한국어가 아님" };
  if (t.length < CAPTION_MIN || t.length > CAPTION_MAX) return { ok: false, reason: `길이 ${t.length}자 (${CAPTION_MIN}~${CAPTION_MAX}자)` };
  if (/[.。!?]$/.test(t) || /\n/.test(t)) return { ok: false, reason: "마침표·줄바꿈 금지" };
  if (SENTENCE_END.test(t)) return { ok: false, reason: "서술형 종결 (명사형으로 끝나야 함)" };
  if (o.title && norm(t) === norm(o.title)) return { ok: false, reason: "기사 제목과 동일" };
  if (o.allowedText !== undefined) {
    const src = o.allowedText.replace(/,/g, "");
    const nums = t.match(/\d[\d.]*/g) ?? [];
    if (nums.some((n) => !src.includes(n.replace(/\.$/, "")))) return { ok: false, reason: "근거 없는 숫자" };
  }
  return { ok: true };
}

export const logoCaption = (company: string) => `${company.trim()} 공식 기업 CI`;
