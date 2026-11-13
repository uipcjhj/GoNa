/**
 * 보스 데이터 (숫자만 바꿔 난이도 조절).
 *
 * 흐름 (src/scenes/GameScene.ts):
 *   1단계 갓난아기 → 2단계 기어 다니는 고나 ─(게이지 가득)→ ⚔ 뽀뽀괴물 → (승리) 3단계 직립보행
 *   → 4단계 자이언트 곤룡 고나 ─(게이지 가득)→ ⚔ 킁카괴물 → (승리) 마지막 모험 (약 75초, src/scenes/FinaleRun.ts)
 *   → 암흑의 이유식 성 → ⚔ 이유식 드래곤 셰프 마녀 (3페이즈) → (승리) 가족 엔딩
 * 보스 행동(공격 패턴)은 src/scenes/battle/KissBattle.ts · SniffBattle.ts · WitchBattle.ts
 */
import type { BossId } from '../events';
import type { GrowthStageId } from './growth';

export type { BossId };

export interface BossDef {
  id: BossId;
  name: string;
  /** 등장 안내 한 줄 */
  intro: string;
  maxHp: number;
  /** 이 체력 비율 이하에서 강화 패턴(2페이즈) */
  phase2At: number;
  /** 필살기 피해 */
  specialDamage: number;
  /** 승리 보너스 점수 */
  scoreBonus: number;
  /** 공격이 끝난 뒤 다음 공격까지 최소 쉬는 시간(초) — 부메랑을 맞힐 빈틈 */
  minRecover: number;
  /** 몸통(돌진·흡입 충돌)에 닿았을 때 HP 피해 */
  bodyDamage: number;
  /** 필살 게이지 충전 배율 (최종 보스는 천천히) */
  specialGainMul: number;
  /** 이 보스가 나오는 성장 단계 (그 단계 게이지가 가득 차면 진화 대신 보스전) */
  atStage: GrowthStageId;
  /** 이기면: 다음 단계로 진화 / 마지막 모험(최종 보스로 가는 길) / 엔딩 */
  afterWin: 'evolve' | 'adventure' | 'ending';
  /** 등장 조건: 'growth' = 성장 게이지 가득 (기본) · 'story' = 이야기 흐름 (마지막 모험 끝 — 게이지로는 안 나옴) */
  trigger?: 'growth' | 'story';
  /** 정식 그림 (선택). 프레임 3장 가로 시트 — 없으면 코드 도트 (src/art/bossArt.ts) */
  sheetUrl: string;
  /**
   * 난이도 (숫자만 바꿔 조절 — BossBattle 이 모든 공격에 똑같이 적용):
   *   pace: 보스 공격·이동·투사체의 빠르기 (1 = 원래, 0.8 = 20% 느리게 → 예고·반격 시간도 그만큼 김)
   *   telegraphExtra: 공격마다 '!' 예고를 이만큼(초) 더 먼저 보여 줌
   *   recoverMul: 공격 사이 쉬는 시간 배율 · damageMul: 고나가 받는 피해 배율
   */
  pace: number;
  telegraphExtra: number;
  recoverMul: number;
  damageMul: number;
}

export const BOSSES: Record<BossId, BossDef> = {
  kiss: {
    id: 'kiss',
    name: '뽀뽀괴물',
    intro: '쪽쪽! 뽀뽀로 괴롭히는 장난꾸러기',
    // 첫 보스: 일반 → 1차 분노(70%) → 2차 분노(35%) → 왕뽀뽀 → 지침 을 모두 겪도록 (8 → 28, 전투 약 1~2분)
    // 한 번에 분노 단계를 건너뛰지 않고(BossBattle.hpFloor), 왕뽀뽀→지침을 보여 주기 전엔 쓰러지지 않음(KissBattle.hpFloor)
    // 분노 4단계 + 필살기 ①②③ 을 모두 겪는 길이 (playtest-bot 반응 120ms 기준 전투 78~79초 — 사람은 더 김)
    // 난이도 하향 (첫 보스 · 초보자도 클리어): HP 50 → 42 (-16%) · 공격 18% 느리게 · 예고 약 +35% · 쉬는 시간 +30% · 받는 피해 -20%
    maxHp: 42,
    phase2At: 0.5,
    specialDamage: 3,
    scoreBonus: 300,
    minRecover: 2.0,
    bodyDamage: 30, // 돌진
    specialGainMul: 1,
    atStage: 'crawler',
    afterWin: 'evolve',
    sheetUrl: 'assets/boss/kiss-sheet.png',
    pace: 0.82,
    telegraphExtra: 0.12,
    recoverMul: 1.3,
    damageMul: 0.8,
  },
  sniff: {
    id: 'sniff',
    name: '킁카괴물',
    intro: '킁킁! 냄새로 숲을 뒤덮는 마지막 괴물',
    // 최종 보스: 돼지코 필살기 ①②③ + 최종 분노 (playtest-bot 반응 120ms 기준 코 약점 ×2 포함 전투 약 95~105초 — 사람은 더 김)
    // 난이도 하향: HP 230 → 196 (-15%) · 공격 15% 느리게 · 냄새 예고 약 +30% · 쉬는 시간 +25% · 받는 피해 -15%
    //   버티기·코 조준도 쉽게 (SniffBattle.RESIST_TIERS · AIM_R · 조준점 속도)
    maxHp: 196,
    phase2At: 0.5,
    specialDamage: 8,
    scoreBonus: 600,
    minRecover: 1.3,
    bodyDamage: 30, // 흡입 후 충돌
    specialGainMul: 0.5,
    atStage: 'bigbaby',
    afterWin: 'adventure',
    sheetUrl: 'assets/boss/sniff-sheet.png',
    pace: 0.85,
    telegraphExtra: 0.1,
    recoverMul: 1.25,
    damageMul: 0.85,
  },
  witch: {
    id: 'witch',
    name: '이유식 드래곤 셰프 마녀',
    intro: '뽀뽀괴물과 킁카괴물을 키운 진짜 흑막!',
    // 최종 보스 3페이즈 (HP 100~70% · 70~35% · 35~0%) — 수치는 아래 WITCH 에서 조절
    // 초보자 기준 약 90~120초: 210 → 180 (반격 기회·필살기 추가 피해가 있어 너무 길어지지 않게)
    maxHp: 200,
    phase2At: 0.7,
    specialDamage: 8,
    scoreBonus: 1000,
    minRecover: 1.0,
    bodyDamage: 25,
    specialGainMul: 0.55,
    atStage: 'bigbaby',
    afterWin: 'ending',
    trigger: 'story',
    sheetUrl: 'assets/boss/witch-sheet.png', // 확정 레퍼런스의 스프라이트에서 추출 (tools/art/witch_from_reference.py)
    pace: 1,
    telegraphExtra: 0.15,
    recoverMul: 1,
    damageMul: 1,
  },
};

/**
 * 최종 보스 '이유식 드래곤 셰프 마녀' 조절값 (초 · HP 피해) — 페이즈별 [1, 2, 3]
 *   모든 공격은 예고(경로·낙하 자리·화살표)와 실제 판정이 같은 자리 · 점프(이단 점프)나 방패로 언제나 피할 수 있음
 */
export const WITCH = {
  /** 페이즈 문턱 (HP 비율) */
  phaseAt: [0.7, 0.35] as const,
  /** 공중에 떠 있는 높이 (땅에서 발까지) */
  hover: 34,
  /** A·D 늘어나는 숟가락: 경로 예고 시간 → 내리꽂기(이 순간 판정) · 빗나가면 어질어질 */
  spoon: { telegraph: [1.25, 1.0, 0.9], strike: 0.2, dmg: 25, stun: 1.9, stunMul: 1.7, comboGap: 0.95 },
  /** B 이유식 폭탄: 낙하 자리 예고 → 떨어져 장판(땅을 따라 고나 쪽으로 — 점프로 넘음) */
  bomb: { telegraph: 1.1, count: [3, 3, 4], fall: 0.55, dmg: 20, spacing: 46 },
  /** C 이유식 회오리: 방울이 위·아래 줄로 날아옴 (오른쪽 화살표: 아래=점프 · 위=가만히) */
  swirl: { count: 6, gap: 1.0, arrow: 0.9, speed: 120, dmg: 20 },
  /** E 초대형 이유식 폭발: 냄비에서 솟아 차례로 떨어짐 (고나 자리 = 점프·방패) → 끝나면 지쳐서 멈춤 */
  pot: { drops: 3, gap: 0.72, telegraph: 1.0, dmg: 25, tired: 2.6, tiredMul: 1.8 },
  /** 공격이 끝난 직후 약점 노출 (초 · 피해 배율) */
  weak: { sec: 1.1, mul: 1.4 },
  // ── 확장 공격 (기존 A~E 는 그대로) ──
  /** 숟가락 삼연타: 늘어나는 숟가락 3번 · 마지막은 lastDelay 초 늦게 (연속 피격은 고나의 피격 무적이 막음) */
  triple: { lastDelay: 0.4 },
  /** 통통 폭탄: 덩어리가 바닥에서 통통 튀며 다가옴 — 튀는 높이가 점점 낮아져 고나 자리에서 가장 낮게 (점프로 넘음) */
  //   (덩어리가 고나 몸을 지나가는 시간이 점프 한 번(약 0.67초)보다 짧아야 피할 수 있음 → 통통을 짧고 빠르게: 가로 약 40px/s 이상)
  bounce: { count: 3, gap: 1.3, heights: [28, 16, 9], g: 500, throwSec: 0.25, telegraph: 0.9, dmg: 18 },
  /** 이유식 소나기: 착탄 자리 예고 → 동시에 떨어짐 → 아주 짧은 바닥 장판. 가운데 물결은 고나 자리가 비어 있음(안전) */
  rain: { waves: 2, gap: 1.1, telegraph: 1.0, spacing: 26, dmg: 18, puddle: 0.35 },
  /** 숟가락 부메랑: 낮은 줄(점프)로 날아가 화면 끝에서 잠깐 멈췄다가 높은 줄(가만히)로 돌아옴 */
  boomer: { telegraph: 1.0, out: 150, back: 120, pause: 0.6, dmg: 20, low: 8, high: 30 },
  /** 높은 숟가락 (가만히): 손잡이가 늘어나 숟가락이 고나 머리 위 높이로 쓸고 지나감 — 서 있으면 안전 · 점프하면 맞음 */
  high: { telegraph: 1.2, lane: 30, speed: 210, dmg: 20 },
  /** 숟가락 내려치기 (방패): 위에서 고나 자리를 내려침 — 판정이 점프 높이까지 닿아 점프로는 못 피함 · 방패로 막으면 마녀가 휘청 (반격 기회)
   *  예고 telegraph 초 · 방패는 누른 뒤 1초 동안 유지(SHIELD.activeMs) → 예고 마지막 1초 안에 누르면 막힘 */
  slam: { telegraph: [1.5, 1.35, 1.25], strike: 0.22, dmg: 25, height: 82, width: 22, stun: 1.9, stunMul: 1.7 },
  /** 마지막 발악: HP 가 at 비율 아래로 → 대사 → 거대한 숟가락 휘두르기(낮은 줄 = 점프) → 무방비(window 초, 한 방이면 끝)
   *  못 맞히면 다시 휘두름 · retries 번 넘게 놓치면 맞을 때까지 어질어질 (무한정 늘어지지 않게) */
  // ── '이유식 대탈출!' 미니게임 ──
  /** ① 이유식 받아치기: 숟가락 들기(raise) → 덩어리가 fly 초 동안 날아와 고나 입 앞(판정 구역)에 도착하는 순간 '퉤!'
   *   |차이| ≤ perfect → 강하게 되돌림 · 그보다 이르게(early 초까지) → 약하게 되돌림 · 그 밖 → 고나 피해 (hurt)
   *   '퉤!' 버튼은 도착 show 초 전부터만 보임 */
  parry: { raise: 0.8, fly: [1.3, 1.2, 1.05], show: 0.9, perfect: 0.14, early: 0.45, dmgPerfect: 16, dmgGood: 7, hurt: 12 },
  /** ③ 이유식 폭탄 반사: 폭탄이 fly 초 뒤 방패 자리에 도착 — 도착 perfect 초 안에 켠 방패 = 반사(마녀 피해) · 더 일찍 켠 방패 = 막기만 · 없으면 피해 */
  reflect: { raise: 0.7, fly: [1.45, 1.3, 1.15], perfect: 0.36, dmg: 16, hurt: 16 },
  /** ② 울음 리듬 배틀: 음표가 lead 초 동안 판정선으로 다가옴 · 톡 = 짧게 · 꾸욱 = hold 초 누르기
   *   판정(모바일 기준 넉넉하게) ±good · 마지막 음파 피해 = base + perHit × 성공 수 · stunAt 개 이상 성공하면 마녀 어질어질 · 놓친 개수 × missHurt 피해 */
  rhythm: {
    lead: 1.7,
    good: 0.22,
    perfect: 0.1,
    // 톡 → 톡 → 꾸욱 → 톡톡! ([박자 초, 꾸욱 길이])
    pattern: [[0, 0], [0.8, 0], [1.6, 0.7], [3.0, 0], [3.35, 0]] as [number, number][],
    speed: [1, 1, 0.82],
    base: 4,
    perHit: 5,
    stunAt: 4,
    missHurt: 4,
  },
  /**
   * 페이즈마다 꼭 한 번씩 겪는 상호작용 — 다 나오기 전엔 HP 가 다음 문턱 아래로 안 내려감
   * (공격력이 세도 페이즈가 순식간에 지나가지 않게 · 전체 약 100~120초)
   */
  mustShow: [
    ['spoon', 'parry', 'reflect'],
    ['chair', 'triple', 'rhythm'],
    ['boomer', 'rain', 'reflect', 'rhythm', 'chair', 'pot'],
  ] as string[][],
  /** ④ 이유식 의자 탈출 (2페이즈 1번 · 3페이즈 강화 1번 — [2페이즈, 3페이즈])
   *   '으아앙!' 연타 mash 초 (탭마다 perTap · 초당 decay 감소) → 숟가락이 입으로 (warn 초 안에 hold 초 꾸욱) → 성공: 음파 강타(dmg × (0.6+게이지)) + 기절
   *   실패: 고나 hurt 피해 + 자동 탈출 */
  chair: { mash: [3.0, 2.4], perTap: 0.07, decay: [0.08, 0.12], warn: [1.8, 1.4], hold: 0.55, dmg: 20, stun: 2.2, stunMul: 1.6, hurt: 10 },
  /** ⑤ 후드리챱챱! (마지막): '챱챱!' 탭마다 perTap · interruptAt 에서 마녀 방해 → '으아앙!' cryWindow 초 안에 hold 초 꾸욱
   *   (실패하면 cryHurt 피해 · retry 초 뒤 다시) → 100% → '후드리챱챱!!!' 한 번 */
  chop: { perTap: 0.06, interruptAt: 0.6, cryWindow: 3.2, hold: 0.55, cryHurt: 8, retry: 1.0 },
  /** 기절한 마녀에게 고나 필살기를 쓰면 피해 배율 */
  stunSpecialMul: 1.5,
  last: { at: 0.07, telegraph: 1.2, speed: 190, dmg: 22, window: [4, 5], retries: 2, mul: 2 },
};

/**
 * 최종 보스 신규 연출에 필요한 승인 그림 (텍스처 키) — 다 있어야 실제 전투에 나옴 (없으면 건너뜀 · 임시 그림 없음)
 *   chair = 이유식 의자 탈출 · chop = 후드리챱챱 피니시 (없으면 기존 '마지막 발악'으로 끝)
 */
export const WITCH_EXTRA_ART = {
  chair: ['witch-chair', 'gona-chair-cry'],
  chop: ['gona-chop', 'giant-goo', 'witch-goo-face', 'witch-hat'],
} as const;

/**
 * 위 그림의 스프라이트 시트 (사용자 시안에서 잘라 정리 — tools/art/witch_finale_from_sheet.py · 고나·마녀와 같은 도트 크기 · 게임에서 1.2배)
 *   witch-chair    0 등장(반짝) · 1 흔들림(!!) · 2 흔들림(진동선) · 3 부서짐
 *   gona-chair-cry 0 의자에 앉음 · 1 울기 · 2 크게 울며 몸부림(팔 번쩍) · 3 의자를 부수고 탈출
 *   gona-chop      0 준비 · 1 주먹(휙) · 2 주먹(!) · 3 크게 휘두르기(마지막 한 방)
 *   giant-goo      0 그대로 · 1 맞아서 움푹 · 2 크게 찌그러짐 · 3 철퍼덕 퍼짐
 *   witch-goo-face 0 이유식 뒤집어씀 · 1 어질어질 · 2 쓰러짐
 *   witch-hat      0 모자 · 1 튕겨 나감 · 2~3 빙글빙글 · 4 떨어짐
 */
export const WITCH_EXTRA_SHEETS: Record<string, { url: string; fw: number; fh: number; frames: number }> = {
  'witch-chair': { url: 'assets/boss/witch-chair.png', fw: 64, fh: 61, frames: 4 },
  'gona-chair-cry': { url: 'assets/boss/gona-chair-cry.png', fw: 63, fh: 62, frames: 4 },
  'gona-chop': { url: 'assets/boss/gona-chop.png', fw: 64, fh: 45, frames: 4 },
  'giant-goo': { url: 'assets/boss/giant-goo.png', fw: 69, fh: 44, frames: 4 },
  'witch-goo-face': { url: 'assets/boss/witch-goo-face.png', fw: 58, fh: 42, frames: 3 },
  'witch-hat': { url: 'assets/boss/witch-hat.png', fw: 30, fh: 26, frames: 5 },
};

/** 필살 게이지 충전량 (0~1 기준) */
export const SPECIAL_GAIN = {
  boomerangHit: 0.2,
  projectileBreak: 0.08,
  snack: 0.2,
  dodge: 0.08,
};

/** 보스전 고나 체력: 하트 1개 = HP 100. 0 이 되면 하트 -1, 남은 하트가 있으면 다시 100 */
export const BATTLE_HP = {
  perHeart: 100,
  /** 맞은 직후 무적(ms) — 연속 피해 방지 (난이도 하향: 700 → 900) */
  hitInvulnMs: 900,
  /** 하트를 잃은 직후 무적(ms) */
  heartLossInvulnMs: 1500,
};

/** 방패: 지속(ms) · 재사용 대기(ms, 발동 시점부터) */
export const SHIELD = { activeMs: 1000, cooldownMs: 4000 };

/** 공격별 HP 피해 */
export const DAMAGE = {
  kissHeart: 20,
  kissWave: 25,
  /** 2차 분노 필살기 왕뽀뽀 */
  kissRoyal: 35,
  /** 2차 분노 필살기 킁카 폭풍의 냄새 파동 */
  sniffStorm: 35,
  /** 돼지코 냄새 파동 (작은 코) */
  sniffNose: 25,
  sniffCloud: 25,
  sniffBlast: 35,
  sniffPuddle: 20,
  /** 강력한 흡입 — 버티기 실패 (난이도 하향: 30 → 22) */
  sniffInhale: 22,
};
