import { DEV } from '../config';
import { perf, setPerfOverlay } from '../perf';
import type { RestartOptions } from '../events';
import { CHECKPOINT_LABEL, loadCheckpoint } from '../game/checkpoint';
/**
 * 대표 타이틀 화면 — 알 부화 스토리(OpeningScene)가 끝나면 나타남.
 *
 * 그림·움직임은 ui/titleScene.ts (오프닝 4종 에셋을 레이어로: 배경 · 고나 · 곤충·과일 · 버섯·덩굴·잎 · 로고).
 * 이 파일은 그 위의 HTML: 게임 시작 / 이어하기 버튼, 안내 문구, 소리 테스트 · 오프닝 다시 보기 · 개발 메뉴.
 */
import { GAME_TITLE } from '../config';
import { sound } from '../audio';
import { el } from './dom';
import { TitleScene } from './titleScene';

export class CoverScreen {
  private root: HTMLElement;
  private title = new TitleScene();
  private ui: HTMLElement;
  private btn: HTMLButtonElement;
  private btnLabel!: HTMLSpanElement;
  private contBtn!: HTMLButtonElement;
  private hint!: HTMLElement;
  private started = false;
  private shown = false;
  /** 소리 테스트 화면 열기 (main 에서 연결) */
  onAudioTest: (() => void) | null = null;
  /** 오프닝 다시 보기 (main 에서 연결) */
  onReplay: (() => void) | null = null;
  /**
   * 게임 화면(Phaser) 그리기 쉬기/다시 (main 에서 연결).
   * 타이틀이 화면을 완전히 덮고 있는 동안 뒤의 게임 캔버스를 매 프레임 그릴 필요가 없음 → 타이틀 애니메이션이 부드러워짐
   */
  onRenderPause: ((paused: boolean) => void) | null = null;
  private pauseTimer = 0;

  constructor(
    parent: HTMLElement,
    private onStart: (opt?: RestartOptions) => void,
  ) {
    this.root = el('section', 'cover hidden');
    this.root.setAttribute('aria-label', GAME_TITLE);
    this.btn = el('button', 'start-btn cover-btn');
    this.btn.type = 'button';
    this.btnLabel = el('span', '', '게임 시작');
    this.btn.append(el('span', 'cover-play', '▶'), this.btnLabel);
    // 이어하기 (체크포인트가 있을 때만)
    this.contBtn = el('button', 'start-btn cover-continue hidden');
    this.contBtn.type = 'button';
    this.contBtn.addEventListener('click', () => this.start({ checkpoint: true }));
    this.hint = el('p', 'cover-hint', '버튼을 누르면 모험이 시작돼요');
    this.ui = el('div', 'cover-ui');
    this.ui.append(this.contBtn, this.btn, this.hint);

    const test = el('button', 'ap-open cover-test', '🔊 소리 테스트');
    test.type = 'button';
    test.addEventListener('click', () => this.onAudioTest?.());
    const replay = el('button', 'ap-open cover-replay', '↺ 오프닝');
    replay.type = 'button';
    replay.addEventListener('click', () => this.onReplay?.());
    // 개발용: 보스전 바로가기 · 성능 표시 (config.ts DEV.bossTestMenu = false 면 숨김)
    const dev = el('div', 'cover-dev');
    if (DEV.bossTestMenu) {
      // 작은 🧪 버튼을 누르면 펼쳐짐 (로고를 가리지 않게)
      const toggle = el('button', 'ap-open cover-dev-toggle', '🧪');
      toggle.type = 'button';
      toggle.setAttribute('aria-label', '개발용 테스트 메뉴');
      const list = el('div', 'cover-dev-list hidden');
      toggle.addEventListener('click', () => list.classList.toggle('hidden'));
      dev.append(toggle, list);
      const mk = (label: string, fn: () => void): void => {
        const b = el('button', 'ap-open cover-dev-btn', label);
        b.type = 'button';
        b.addEventListener('click', fn);
        list.append(b);
      };
      mk('🧪 뽀뽀괴물 테스트', () => this.start({ boss: 'kiss' }));
      mk('🧪 킁카괴물 테스트', () => this.start({ boss: 'sniff' }));
      // 몬스터 즉시 테스트: 개발 모드(npm run dev) 또는 주소에 ?dev / ?test 가 있을 때만 (정식 플레이에선 숨김)
      const q = new URLSearchParams(window.location.search);
      if (import.meta.env.DEV || q.has('dev') || q.has('test')) mk('🧪 몬스터 테스트 (3단계)', () => this.start({ devMonsters: true }));
      const label = (): string => (perf.enabled ? '📈 성능 표시 끄기' : '📈 성능 표시 켜기');
      mk(label(), () => {
        setPerfOverlay(!perf.enabled);
        const last = list.lastElementChild;
        if (last) last.textContent = label();
      });
    }

    this.root.append(this.title.root, this.ui, test, replay, dev);
    // 테스트 배포(GitHub Pages)에서만: 빌드 때 VITE_BUILD_LABEL 이 주어지면 버전·커밋 표시 (평소 빌드·미리보기엔 없음)
    const buildLabel = import.meta.env.VITE_BUILD_LABEL as string | undefined;
    if (buildLabel) this.root.append(el('div', 'build-badge', buildLabel));
    parent.append(this.root);

    this.btn.addEventListener('click', () => this.start());
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      sound.unlock();
      sound.startMusic('title');
    });
    window.addEventListener('resize', () => this.layout());
    // 앱 안 미리보기 창처럼 window 크기와 실제 보이는 크기가 다를 수 있어, 실제 요소 크기가 바뀔 때마다 다시 배치
    if ('ResizeObserver' in window) new ResizeObserver(() => this.layout()).observe(this.root);
    void this.title.init().then(() => this.layout());
  }

  get isVisible(): boolean {
    return this.shown && !this.started;
  }

  /**
   * 알 부화 장면이 끝나면 호출: 대표 타이틀이 (배율 변화 없이) 페이드인 → 로고 → 버튼.
   * instant: 건너뛰기 — 바로 표시
   */
  reveal(instant: boolean): void {
    this.started = false;
    // 저장된 진행이 있으면 '이어하기' + '새 게임'
    const cp = loadCheckpoint();
    this.contBtn.classList.toggle('hidden', !cp);
    this.contBtn.replaceChildren(el('span', 'cover-play', '💾'), el('span', '', `이어하기 · ${cp ? CHECKPOINT_LABEL[cp.id] : ''}`));
    this.btnLabel.textContent = cp ? '새 게임' : '게임 시작';
    this.hint.textContent = cp ? `저장: ${CHECKPOINT_LABEL[cp.id]} · 점수 ${cp.score}` : '버튼을 누르면 모험이 시작돼요';
    this.root.classList.remove('hidden', 'leaving', 'revealed', 'instant');
    this.btn.classList.remove('pressed');
    this.shown = true;
    this.layout();
    if (instant) {
      this.root.classList.add('revealed', 'instant');
    } else {
      // 확대→축소 줌은 도트 그림을 매 프레임 다른 배율로 다시 샘플링해 고나가 '떨리는' 것처럼 보였음 → 최종 배율 그대로 페이드인만
      void this.root.offsetWidth;
      requestAnimationFrame(() => this.root.classList.add('revealed'));
    }
    this.title.start();
    perf.section('타이틀');
    // 페이드인이 끝나고(알 부화 장면도 멈춘 뒤) 뒤의 게임 그리기를 쉼
    clearTimeout(this.pauseTimer);
    this.pauseTimer = window.setTimeout(() => {
      if (this.isVisible) this.onRenderPause?.(true);
    }, 1400);
  }

  /** 오프닝 다시 보기: 잠시 숨김 */
  hide(): void {
    clearTimeout(this.pauseTimer);
    this.onRenderPause?.(false);
    this.root.classList.add('hidden');
    this.shown = false;
    this.title.stop();
  }

  /** (테스트용) 타이틀 애니메이션 상태 */
  debugTitle(): ReturnType<TitleScene['debug']> {
    return this.title.debug();
  }

  // ───────────────────────── 배치 ─────────────────────────

  layout(): void {
    if (!this.shown) return;
    // 실제로 보이는 크기 (window.innerWidth 대신 화면 요소 자체의 크기)
    const vw = this.root.clientWidth || window.innerWidth;
    const vh = this.root.clientHeight || window.innerHeight;
    const portrait = vw / vh < 1;
    this.root.classList.toggle('portrait', portrait);
    this.root.classList.toggle('side', !portrait);
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;top:0;left:0;height:env(safe-area-inset-top);width:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);visibility:hidden';
    document.body.append(probe);
    const safe = { top: probe.offsetHeight, left: probe.offsetWidth, right: 0, bottom: 0 };
    const cs = getComputedStyle(probe);
    safe.right = parseFloat(cs.paddingRight) || 0;
    safe.bottom = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
    // 오른쪽 위 작은 버튼들(🧪 · 🔊)의 영역: 로고가 겹치지 않게
    let avoid: { left: number; bottom: number } | undefined;
    for (const sel of ['.cover-dev-toggle', '.top-buttons']) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (r && r.width > 0 && r.top < vh * 0.25) avoid = { left: Math.min(avoid?.left ?? 1e9, r.left), bottom: Math.max(avoid?.bottom ?? 0, r.bottom) };
    }
    this.title.layout(vw, vh, safe, avoid);
    if (portrait) {
      // 버튼: 고나가 걷는 흙길(발끝) 아래 풀밭 가운데
      const unit = Math.max(3.6, Math.min(vw / 85, 7));
      this.ui.style.setProperty('--b', `${unit}px`);
      Object.assign(this.ui.style, { left: '0px', right: '0px', width: 'auto' });
      const uiH = this.ui.offsetHeight || unit * 16;
      const below = vh - this.title.feetCss - safe.bottom;
      const bottom = below > uiH + 40 ? Math.max(safe.bottom + 52, safe.bottom + (below - uiH) / 2) : Math.max(16, safe.bottom + 12);
      this.ui.style.bottom = `${bottom}px`;
    } else {
      // 가로: 오른쪽 띠(그림 바깥)에, 좁으면 그림 오른쪽 아래
      const unit = Math.max(3.2, Math.min(vw / 110, vh / 88, 6));
      this.ui.style.setProperty('--b', `${unit}px`);
      Object.assign(this.ui.style, { left: '0px', right: 'auto', width: 'max-content' });
      const uiW = this.ui.offsetWidth || unit * 40;
      const uiH = this.ui.offsetHeight || unit * 16;
      const stageR = (vw + this.title.stageWidthCss) / 2;
      const room = vw - stageR - safe.right;
      const x = room > uiW + 16 ? stageR + (room - uiW) / 2 : vw - uiW - Math.max(12, safe.right + 8);
      Object.assign(this.ui.style, { left: `${x}px`, bottom: `${Math.max(12, (vh - uiH) * 0.3)}px` });
    }
  }

  // ───────────────────────── 시작 ─────────────────────────

  /** 게임 시작 버튼 (Space 키도). boss = 개발용 보스전 바로가기 */
  start(opt?: RestartOptions): void {
    if (this.started || !this.shown) return;
    this.started = true;
    perf.section('게임');
    // 게임 화면을 다시 그리기 시작 (버튼이 사라지며 게임이 보이기 전에)
    clearTimeout(this.pauseTimer);
    this.onRenderPause?.(false);
    sound.unlock();
    sound.start();
    sound.startMusic('title');
    this.btn.classList.add('pressed');
    this.root.classList.add('leaving');
    window.setTimeout(() => this.onStart(opt), 350);
    window.setTimeout(() => {
      this.root.classList.add('hidden');
      this.shown = false;
      this.title.stop();
    }, 900);
  }
}
