/**
 * GONA's Food Adventure ↔ 고나 게임천국 기록 연동 (Food 쪽 최소 패치) — 적용 전 준비본
 *
 *  - 게임천국이 `?gp=<세션ID>` 로 실행했을 때만 켜진다. 주소에 gp 가 없거나, 세션이 없거나 만료/다른 게임이면
 *    아무 이벤트도 구독하지 않고 DOM 도 만들지 않는 **완전한 no-op** (단독 플레이는 이전과 동일).
 *  - 게임 로직·점수·사운드·오프닝·엔딩·기존 저장 키는 읽지도 쓰지도 않는다. `bus` 이벤트(start/pause/resume/gameOver/endingStart)만 듣는다.
 *  - 쓰는 곳은 `gp.v1.inbox.<resultId>` 새 키 하나뿐(결과 1판 = 키 1개). 이미 있는 키를 덮어쓰지 않는다.
 *  - Food 의 모듈(bus, EV …)을 직접 import 하지 않고 주입받아서(`deps`) 게임천국 쪽 테스트에서도 그대로 검증한다.
 *
 * 계약: docs/platform/GAME_RESULT_CONTRACT.md
 */

export interface BusLike {
  on(event: string, fn: (...args: any[]) => void): unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface EvLike {
  start: string;
  pause: string;
  resume: string;
  gameOver: string;
  endingStart: string;
  /** 돌아가기 버튼 숨김용 (선택) */
  restart?: string;
  endingTheEnd?: string;
}
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
export interface GameOverInfoLike {
  score: number;
  growthLevel?: number;
  growthName?: string;
  snacks?: number;
  cleared?: boolean;
  bossRetry?: string;
}

export interface ParadiseDeps {
  bus: BusLike;
  EV: EvLike;
  /** 기본: window.localStorage */
  storage?: StorageLike | null;
  /** 기본: window.location.search / origin */
  search?: string;
  origin?: string;
  now?: () => number;
  uuid?: () => string;
  /** 돌아가기 버튼을 붙일 부모 (없으면 버튼 없음 — 뒤로가기로도 결과는 반영됨) */
  parent?: HTMLElement | null;
  gameVersion?: string;
}

const GAME_ID = 'food-island';
const SESSION_PREFIX = 'gp.v1.session.';
const INBOX_PREFIX = 'gp.v1.inbox.';
const MAX_INBOX = 20;

interface Session {
  version: 1;
  sessionId: string;
  gameId: string;
  playerId: string;
  startedAt: string;
  expiresAt: string;
  returnUrl: string;
}

function readSession(storage: StorageLike, sid: string, now: number, origin: string): Session | null {
  if (!/^[\w-]{8,64}$/.test(sid)) return null;
  try {
    const raw = storage.getItem(SESSION_PREFIX + sid);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s || s.version !== 1 || s.sessionId !== sid || s.gameId !== GAME_ID) return null;
    if (Date.parse(s.expiresAt) < now) return null;
    // 돌아갈 주소는 같은 출처(게임천국)만 허용
    if (new URL(s.returnUrl).origin !== origin) return null;
    return s;
  } catch {
    return null;
  }
}

const rnd = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);

export function initParadise(deps: ParadiseDeps): { active: boolean; returnUrl: string | null } {
  const storage = deps.storage !== undefined ? deps.storage : typeof window !== 'undefined' ? safeLocalStorage() : null;
  const search = deps.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const origin = deps.origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const now = deps.now ?? Date.now;
  const sid = new URLSearchParams(search).get('gp');
  if (!sid || !storage) return { active: false, returnUrl: null };
  const session = readSession(storage, sid, now(), origin);
  if (!session) return { active: false, returnUrl: null };

  const uuid = deps.uuid ?? rnd;
  const { bus, EV } = deps;
  let run: { id: string; startedAt: number; pausedMs: number; pauseAt: number | null; done: boolean } | null = null;
  const pending: string[][] = []; // [key, json] — 저장 실패 시 메모리에 보관했다가 재시도

  const flush = (): void => {
    for (let i = pending.length - 1; i >= 0; i--) {
      try {
        storage.setItem(pending[i][0], pending[i][1]);
        pending.splice(i, 1);
      } catch {
        /* 다음 기회에 재시도 */
      }
    }
  };

  const finish = (info: GameOverInfoLike, outcome: 'cleared' | 'failed'): void => {
    if (!run || run.done) return; // 한 판당 한 번 (엔딩 다시보기 등 중복 이벤트 무시)
    run.done = true;
    const end = now();
    const paused = run.pausedMs + (run.pauseAt !== null ? end - run.pauseAt : 0);
    const resultId = uuid();
    const envelope = {
      kind: 'gp-result',
      v: 1,
      sdk: 'food-patch/0.1',
      result: {
        resultId,
        sessionId: session.sessionId,
        gameId: GAME_ID,
        gameVersion: deps.gameVersion ?? '1.0.0',
        scoreSchemaVersion: 1,
        outcome,
        score: Math.max(0, Math.floor(info.score)),
        stage: info.growthLevel,
        stageLabel: info.growthName,
        startedAt: new Date(run.startedAt).toISOString(),
        endedAt: new Date(end).toISOString(),
        durationMs: Math.max(0, end - run.startedAt - paused),
        extra: { snacks: info.snacks ?? 0, ...(info.bossRetry ? { bossRetry: info.bossRetry } : {}) },
      },
    };
    pending.push([INBOX_PREFIX + resultId, JSON.stringify(envelope)]);
    flush();
  };

  bus.on(EV.start, () => {
    run = { id: uuid(), startedAt: now(), pausedMs: 0, pauseAt: null, done: false };
  });
  bus.on(EV.pause, () => {
    if (run && run.pauseAt === null) run.pauseAt = now();
  });
  bus.on(EV.resume, () => {
    if (run && run.pauseAt !== null) {
      run.pausedMs += now() - run.pauseAt;
      run.pauseAt = null;
    }
  });
  bus.on(EV.gameOver, (info: GameOverInfoLike) => finish(info, 'failed'));
  bus.on(EV.endingStart, (info: GameOverInfoLike) => finish(info, 'cleared'));

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    window.addEventListener('pagehide', flush);
  }

  // 돌아가기 버튼 (선택): 게임 오버·엔딩 마지막 화면에서만 보이고, 게임 시작/다시하기 때 숨김. 기존 UI 는 건드리지 않음
  if (deps.parent && typeof document !== 'undefined') {
    const btn = document.createElement('a');
    btn.href = session.returnUrl;
    btn.textContent = '🏝 게임천국으로 돌아가기';
    btn.setAttribute('data-gp-return', '1');
    btn.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 10px);z-index:99999;display:none;pointer-events:auto;touch-action:manipulation;padding:10px 14px;font:700 13px Galmuri11,sans-serif;color:#3b1b5e;background:#fff4d6;border:3px solid #3b1b5e;text-decoration:none;box-shadow:0 3px 0 #3b1b5e;';
    // #ui 는 pointer-events:none 이라 버튼에서 켜 주고, 버튼 터치가 게임(점프/탭)으로 새지 않게 막음
    for (const ev of ['pointerdown', 'touchstart', 'click']) btn.addEventListener(ev, (e) => e.stopPropagation());
    deps.parent.appendChild(btn);
    const show = (): void => {
      flush();
      btn.style.display = 'block';
    };
    const hide = (): void => {
      btn.style.display = 'none';
    };
    bus.on(EV.gameOver, show);
    bus.on(EV.endingTheEnd ?? EV.endingStart, show);
    bus.on(EV.start, hide);
    if (EV.restart) bus.on(EV.restart, hide);
  }
  void MAX_INBOX;
  return { active: true, returnUrl: session.returnUrl };
}

function safeLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
