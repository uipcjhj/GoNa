/**
 * 스토리 프롤로그 대본.
 * 내레이션 파일: public/assets/voice/prologue-01.mp3 … prologue-10.mp3 (audio.ts → narrationUrl)
 *   파일이 없으면 자막만 나오고, 문장 길이로 계산한 시간만큼 보여 줍니다.
 */
export interface PrologueLine {
  text: string;
  /** 이 문장 장면의 최소 길이(초) — 내레이션이 짧아도 연출이 끝날 시간 */
  minSec: number;
}

export const PROLOGUE: PrologueLine[] = [
  { text: '2026년 4월 10일.', minSec: 3.2 },
  { text: '벚꽃이 흐드러지게 피던 어느 봄날.', minSec: 4.2 },
  { text: '야생의 작은 공룡, 고나가 알을 깨고 세상에 나왔어요!', minSec: 6.4 },
  { text: '아직 세상에 대해 아무것도 모르는 고나.', minSec: 4.2 },
  { text: '하지만 호기심만큼은 누구보다 컸답니다.', minSec: 4.0 },
  { text: '고나는 맛있는 간식을 찾아 무작정 모험을 떠났어요.', minSec: 5.6 },
  { text: '그런데 말이죠…', minSec: 3.0 },
  { text: '이 숲에는 무시무시한 뽀뽀괴물과 킁카괴물이 살고 있었어요!', minSec: 5.6 },
  { text: '과연 고나는 괴물들을 물리치고, 모험을 무사히 끝낼 수 있을까요?', minSec: 5.6 },
  { text: '이제, 고나의 이야기가 시작됩니다.', minSec: 3.6 },
];

/** 문장 사이 여백(초) */
export const LINE_GAP = 0.9;
