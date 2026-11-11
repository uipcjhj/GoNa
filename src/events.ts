import Phaser from 'phaser';

/** 게임(Phaser) ↔ 화면 UI(DOM) 사이의 이벤트 통로 */
export const bus = new Phaser.Events.EventEmitter();

export const EV = {
  /** 텍스처 준비 완료: (preview: CharacterPreview) */
  ready: 'ready',
  /** 타이틀 → 게임 시작 요청 */
  requestStart: 'requestStart',
  /** 게임 시작 */
  start: 'start',
  /** 게임 오버: ({ score, best, isNewBest }) */
  gameOver: 'gameOver',
  /** 다시하기 요청 */
  restart: 'restart',
  /** 일시정지 / 재개 (게임이 실제로 멈췄을 때 알림) */
  pause: 'pause',
  resume: 'resume',
  /** UI → 게임: 일시정지 / 재개 요청 */
  requestPause: 'requestPause',
  requestResume: 'requestResume',
  /** 성장: 진화 연출 시작 / 새 단계 확정({ level, name, description }) / 연출 끝 */
  evolveStart: 'evolveStart',
  evolve: 'evolve',
  evolveEnd: 'evolveEnd',
  /** 오프닝 시네마틱: 시작 / 끝(→대표 타이틀, { instant }) / 건너뛰기 요청 / 다시 보기 요청 */
  openingStart: 'openingStart',
  openingDone: 'openingDone',
  skipOpening: 'skipOpening',
  replayOpening: 'replayOpening',
  /** 스토리 프롤로그: 시작(첫 터치) / 다음 문장 요청 / 문장 시작({ index, total, text, seconds }) / 끝 */
  prologueBegin: 'prologueBegin',
  prologueNext: 'prologueNext',
  prologueLine: 'prologueLine',
  prologueEnd: 'prologueEnd',
  /** 화면 터치 */
  tap: 'tap',
  /** UI → 게임: 머리카락 부메랑 / 필살기 */
  attack: 'attack',
  special: 'special',
  /** UI → 게임: 보스전 '피하기' 버튼 = 점프 / 공중에서 한 번 더 = 더블 점프 */
  dodge: 'dodge',
  /** UI → 게임: 보스전 방패 */
  shield: 'shield',
  /** 게임 → UI: 공격 버튼·필살 게이지·보스 체력 표시 (CombatHud) */
  combatHud: 'combatHud',
  /** 게임 → UI: 화면 가운데 큰 안내 ({ top, name, desc, ms, tone }) */
  banner: 'banner',
  /** 보스전 시작 / 끝({ id, win }) */
  bossStart: 'bossStart',
  bossEnd: 'bossEnd',
  /** 엔딩 (마지막 보스 격파) — GameOverInfo 와 같은 모양 + cleared */
  ending: 'ending',
  /** 보스 패배 대사: 시작({ name, lines }) / 끝(타이핑 완료·건너뛰기) / 취소(다시하기 등) */
  bossTalk: 'bossTalk',
  /** 보스 패배 확정 (대사·퇴장 연출 동안 전투 HUD·버튼 숨김) */
  bossDefeat: 'bossDefeat',
  /** (개발용 테스트 메뉴) 시나리오 시작 */
  testScenario: 'testScenario',
  bossTalkDone: 'bossTalkDone',
  bossTalkCancel: 'bossTalkCancel',
  /** 가족 엔딩 연출 시작 (GameOverInfo) / THE END 화면 / 엔딩 다시보기 요청 */
  endingStart: 'endingStart',
  endingTheEnd: 'endingTheEnd',
  /** 엔딩 액자 장면 번호 (0~7) */
  endingFrame: 'endingFrame',
  /** 킁카괴물 코 타이밍 바: { show, pos(0~1), perfect, good, left, paused } */
  aimBar: 'aimBar',
  /** 타이밍 바 판정 'perfect' | 'good' | 'miss' */
  aimJudge: 'aimJudge',
  /** 엔딩 액자 효과 ('kiss' | 'sniff') */
  endingFx: 'endingFx',
  /** 엔딩 마지막 화면 단계: 'title' 타이틀 · 'credits' 크레딧 · 'final' 마지막 문구 · 'black' 검은 화면 */
  endingPhase: 'endingPhase',
  endingReplay: 'endingReplay',
} as const;

export type BossId = 'kiss' | 'sniff';

/** 공격 버튼 상태: 숨김 / 잠김(각성 전) / 던질 수 있음 / 날아가는 중(돌아오기 전) */
export type AttackState = 'hidden' | 'locked' | 'ready' | 'out';

export interface CombatHud {
  /** 'none' = 조작 버튼 없음 · 'run' = 평소 달리기(공격 버튼만, 점프는 화면 터치) · 'battle' = 보스전(피하기·공격·필살 3버튼) */
  mode: 'none' | 'run' | 'battle';
  /** 지금 누를 수 있는지 (일시정지·진화·연출 중엔 false) */
  enabled: boolean;
  attack: AttackState;
  /** 부메랑이 돌아올 때까지 남은 정도 1 → 0 */
  cooldown: number;
  /** 방패: 숨김 / 쓸 수 있음 / 켜짐 / 재사용 대기 (shieldCool 1 → 0) */
  shield: 'hidden' | 'ready' | 'active' | 'cool';
  shieldCool: number;
  /** 필살 게이지 0~1 (보스전에서만) */
  special: number;
  specialReady: boolean;
  boss: { name: string; hp: number; maxHp: number; phase: number } | null;
  /** 고나 체력: 하트 + 지금 하트의 HP (일반 스테이지·보스전 공통) */
  player: { hearts: number; maxHearts: number; hp: number; maxHp: number } | null;
  /** 점수 (화면 위 왼쪽) */
  score: number;
  /** 잠깐 바뀌는 버튼: 'aim' = 공격 버튼이 '조준!' · 'resist' = 방패 버튼이 '버티기!' (+ 버티기 게이지 0~1) */
  qte?: { kind: 'aim' } | { kind: 'resist'; gauge: number; left: number } | null;
  /** 성장 게이지 (보스전 중엔 null) */
  growth: { ratio: number; level: number; levels: number; final: boolean } | null;
}

export interface BannerInfo {
  top: string;
  name: string;
  desc?: string;
  ms: number;
  tone?: 'boss' | 'good' | 'power' | 'special';
}

export interface GameOverInfo {
  score: number;
  best: number;
  isNewBest: boolean;
  snacks: number;
  /** 이번 판에서 도달한 성장 단계 (1~4) */
  growthLevel: number;
  growthName: string;
  /** 지금까지 최고 성장 단계 */
  bestGrowthLevel: number;
  growthLevels: number;
  /** 보스전에서 졌으면 그 보스 (게임 오버 화면에 '보스전 다시 도전' 버튼) */
  bossRetry?: BossId;
  /** 엔딩 (모든 보스 격파) */
  cleared?: boolean;
}

/** 다시하기 요청 옵션 */
export interface RestartOptions {
  /** 엔딩 → 타이틀로 (게임은 대기 상태로 다시 준비) */
  toTitle?: boolean;
  /** 저장된 체크포인트에서 이어하기 */
  checkpoint?: boolean;
  /** (개발용) 3단계에서 바로 일반 몬스터 확인 */
  devMonsters?: boolean;
  /** 이 보스전부터 바로 다시 (점수·간식 수는 이어서) */
  boss?: BossId;
  score?: number;
  snacks?: number;
}

export interface EvolveInfo {
  level: number;
  name: string;
  description: string;
}
