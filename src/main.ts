import Phaser from 'phaser';
import './style.css';
import { VIEW } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { OpeningScene } from './scenes/OpeningScene';
import { EndingScene } from './scenes/EndingScene';
import { el } from './ui/dom';
import { Overlay } from './ui/overlay';
import { CoverScreen } from './ui/cover';
import { AudioPanel } from './ui/audioPanel';
import { Subtitles } from './ui/subtitles';
import { BattleUi } from './ui/battleUi';
import { EndingUi } from './ui/endingUi';
import { BossTalk } from './ui/bossTalk';
import { bus, EV } from './events';
import { sound } from './audio';
import { perf, setPerfOverlay } from './perf';
import { runScenario, showTestMenu, testParam } from './devtest';
import { storage } from './storage';
import fontUrl from 'galmuri/dist/Galmuri11-Bold.woff2?url';

/** 화면 비율에 맞춰 논리 해상도를 계산 (가로: 높이 고정, 세로: 너비 고정) */
function computeSize(): { width: number; height: number } {
  const vw = window.innerWidth || 800;
  const vh = window.innerHeight || 450;
  const aspect = vw / vh;
  if (aspect >= VIEW.minWidth / VIEW.baseHeight) {
    const width = Math.round(Phaser.Math.Clamp(VIEW.baseHeight * aspect, VIEW.minWidth, VIEW.maxWidth));
    return { width, height: VIEW.baseHeight };
  }
  const height = Math.round(Phaser.Math.Clamp(VIEW.baseWidth / aspect, VIEW.minHeight, VIEW.maxHeight));
  return { width: VIEW.baseWidth, height };
}

async function boot(): Promise<void> {
  // 픽셀 폰트를 먼저 불러와야 캔버스 글자가 바로 갈무리체로 나옵니다.
  try {
    const face = new FontFace('Galmuri11', `url(${fontUrl})`);
    document.fonts.add(face);
    await Promise.race([face.load(), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* 폰트 로드 실패 시 기본 글꼴 사용 */
  }

  const ui = document.getElementById('ui');
  if (!ui) throw new Error('#ui not found');
  // 개발용 기능 테스트 (?test=menu · ?test=<id>) — 저장하지 않음
  const scenario = testParam();
  if (scenario) storage.readOnly = true;
  // 흐름: 스토리 프롤로그(알 부화 포함, Phaser + 자막) → 카메라가 물러나며 대표 타이틀 → 게임 시작 → 1단계
  const cover = new CoverScreen(ui, (opt) => bus.emit(EV.requestStart, opt));
  const subs = new Subtitles(ui);
  // 프롤로그 중 화면 위 작은 UI: 건너뛰기
  let openingActive = false;
  let prologueStarted = false;
  /** '오프닝 다시 보기'처럼 이미 소리가 켜진 상태면 대기 없이 바로 시작 */
  let autoBegin = false;
  const opUi = el('div', 'opening-ui hidden');
  const skipBtn = el('button', 'ap-open op-skip', '건너뛰기 ▶▶');
  skipBtn.type = 'button';
  skipBtn.addEventListener('click', () => bus.emit(EV.skipOpening));
  opUi.append(skipBtn);
  ui.append(opUi);
  /** 첫 터치(사용자 동작 안에서): 소리 켜고 이야기 시작 */
  const beginPrologue = (): void => {
    if (!openingActive || prologueStarted) return;
    prologueStarted = true;
    sound.unlock();
    sound.startMusic('title');
    subs.hideGate();
    bus.emit(EV.prologueBegin);
  };
  subs.onBegin = beginPrologue;
  bus.on(EV.openingStart, () => {
    // 성능: 프롤로그 동안 뒤의 게임 장면(배경·오브젝트)은 화면을 덮인 채로도 매 프레임 계산·그리기를 하고 있었음
    // → 재워 둠 (그리기 시간이 약 절반으로). 프롤로그가 끝나면 다시 깨움.
    if (game.scene.isActive('Game')) game.scene.sleep('Game');
    openingActive = true;
    prologueStarted = false;
    opUi.classList.remove('hidden');
    subs.show();
    if (autoBegin) {
      autoBegin = false;
      beginPrologue();
    }
  });
  bus.on(EV.openingDone, (info: { instant: boolean }) => {
    if (game.scene.isSleeping('Game')) game.scene.wake('Game');
    openingActive = false;
    opUi.classList.add('hidden');
    subs.hide();
    cover.reveal(info.instant);
  });
  cover.onReplay = () => {
    cover.hide();
    sound.unlock();
    autoBegin = true;
    game.scene.start('Opening');
  };
  const overlay = new Overlay(ui);
  // ── 가족 엔딩: 자막은 저절로 넘어가고(터치 무시), 끝나면 THE END 화면
  const endingUi = new EndingUi(ui);
  let endingActive = false;
  bus.on(EV.endingStart, () => {
    endingActive = true;
    document.body.classList.add('in-ending');
    subs.show();
    subs.hideGate();
    subs.root.classList.add('auto');
  });
  // 타이틀이 나오면 자막 상자는 닫음 (타이틀·크레딧·마지막 문구는 endingUi)
  bus.on(EV.endingPhase, (p: string) => {
    if (p === 'title') {
      subs.hide();
      subs.root.classList.remove('auto');
    }
  });
  bus.on(EV.endingTheEnd, () => {
    subs.hide();
    subs.root.classList.remove('auto');
  });
  const leaveEnding = (): void => {
    sound.stopEnding();
    endingActive = false;
    document.body.classList.remove('in-ending');
    subs.hide();
    subs.root.classList.remove('auto');
  };
  endingUi.onRestart = () => {
    leaveEnding();
    bus.emit(EV.restart, {});
  };
  endingUi.onTitle = () => {
    leaveEnding();
    bus.emit(EV.restart, { toTitle: true });
    sound.startMusic('title');
    cover.reveal(false);
  };
  endingUi.onReplay = () => bus.emit(EV.endingReplay);
  const audioPanel = new AudioPanel(ui);
  new BattleUi(ui);
  new BossTalk(ui);
  cover.onAudioTest = () => audioPanel.open();
  overlay.onAudioTest = () => audioPanel.open();

  const size = computeSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#f8eac0',
    pixelArt: true,
    powerPreference: 'high-performance',
    roundPixels: true,
    width: size.width * VIEW.renderScale,
    height: size.height * VIEW.renderScale,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { keyboard: false, mouse: false, touch: false },
    scene: [BootScene, GameScene, OpeningScene, EndingScene],
  });

  perf.attach(game.events);
  // 타이틀이 화면을 덮는 동안 뒤의 게임 그리기 쉬기 (게임 진행·상태는 그대로, 시작 버튼 누르면 즉시 다시)
  cover.onRenderPause = (paused) => {
    if (paused) game.loop.sleep();
    else game.loop.wake(true);
  };

  if (scenario === 'menu') showTestMenu(ui);
  else if (scenario) {
    // 프롤로그 외에는 오프닝을 건너뛰고 타이틀 → 곧바로 게임 시작 → 시나리오
    const prologueTest = scenario === 'prologue' || scenario === 'prologue-perf' || scenario === 'prologue-loop';
    bus.once(EV.openingStart, () => {
      if (!prologueTest) window.setTimeout(() => bus.emit(EV.skipOpening), 50);
    });
    if (!prologueTest) {
      bus.once(EV.openingDone, () => window.setTimeout(() => cover.start(), 120));
      bus.once(EV.start, () => window.setTimeout(() => runScenario(scenario, game, ui), 300));
    } else {
      runScenario(scenario, game, ui);
      // 성능 테스트: FPS·끊긴 프레임 기록 표시 (장면별 기록은 '복사'로)
      if (scenario !== 'prologue') setPerfOverlay(true);
      if (scenario === 'prologue-loop') {
        // 프롤로그가 끝나면 1.5초 뒤 다시 처음부터 (반복 재생 중 오브젝트·리스너가 쌓이지 않는지 확인용)
        let loops = 0;
        bus.on(EV.openingDone, () => {
          loops++;
          window.setTimeout(() => {
            const info = document.querySelector('.tm-info');
            if (info) {
              info.textContent = `프롤로그 반복 ${loops}회 · 장면 오브젝트 ${game.scene.getScene('Game').children.list.length}개`;
              info.classList.remove('hidden');
            }
            cover.onReplay?.();
          }, 1500);
        });
      }
    }
  }

  // 자동 테스트용: 주소 끝에 ?test 를 붙였을 때만 게임 객체를 노출
  if (new URLSearchParams(window.location.search).has('test')) {
    (window as unknown as { __gona: Phaser.Game }).__gona = game;
    (window as unknown as { __sound: typeof sound }).__sound = sound;
    (window as unknown as { __perf: typeof perf }).__perf = perf;
    (window as unknown as { __coverDebug: () => unknown }).__coverDebug = () => cover.debugTitle();
  }

  // 회전/창 크기 변경 시 논리 해상도 재계산
  let resizeTimer = 0;
  const onResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const s = computeSize();
      const w = s.width * VIEW.renderScale;
      const h = s.height * VIEW.renderScale;
      if (w !== game.scale.width || h !== game.scale.height) game.scale.setGameSize(w, h);
      game.scale.refresh();
    }, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // ── 터치 입력: 화면 어디를 눌러도 점프 (버튼 제외)
  const onPointer = (ev: PointerEvent): void => {
    const target = ev.target as HTMLElement | null;
    if (target?.closest('button') || target?.closest('a') || target?.closest('.audio-panel') || target?.closest('.test-menu')) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    perf.time('input:screen', () => handlePointer());
  };
  const handlePointer = (): void => {
    sound.unlock();
    // 프롤로그 중 터치: 처음엔 이야기 시작, 그 뒤로는 다음 문장
    if (openingActive) {
      if (!prologueStarted) beginPrologue();
      else bus.emit(EV.prologueNext);
      return;
    }
    if (endingActive) return; // 엔딩은 저절로 진행 (THE END 버튼만)
    if (cover.isVisible) return; // 대표 타이틀은 '게임 시작' 버튼으로만 진행
    if (overlay.isGameOverVisible) return;
    // 보스전도 평소처럼 화면 빈 곳 터치 = 점프 (버튼 위 터치는 위에서 걸러져 중복 점프 없음)
    bus.emit(EV.tap);
  };
  document.addEventListener('pointerdown', onPointer, { passive: false });

  // 데스크톱 테스트용 키보드
  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyW') {
      ev.preventDefault();
      sound.unlock();
      if (openingActive) {
        if (!prologueStarted) beginPrologue();
        else bus.emit(EV.prologueNext);
      } else if (endingActive) {
        /* 엔딩 중엔 무시 */
      } else if (cover.isVisible) cover.start();
      else if (overlay.isGameOverVisible) overlay.tryRetry();
      else bus.emit(EV.tap);
    } else if (ev.code === 'KeyX' || ev.code === 'KeyJ') {
      bus.emit(EV.attack); // 머리카락 부메랑
    } else if (ev.code === 'KeyC' || ev.code === 'KeyK') {
      bus.emit(EV.special); // 필살기
    } else if (ev.code === 'KeyP' || ev.code === 'Escape') {
      bus.emit(overlay.isPaused ? EV.requestResume : EV.requestPause);
    }
  });

  // 길게 누르기 메뉴, 더블탭 확대, 스크롤 방지
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.test-menu')) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // 앱 전환 시 자동 일시정지
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) bus.emit(EV.requestPause);
  });
}

void boot();
