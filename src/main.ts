import Phaser from 'phaser';
import './style.css';
import { VIEW } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { OpeningScene } from './scenes/OpeningScene';
import { el } from './ui/dom';
import { Overlay } from './ui/overlay';
import { CoverScreen } from './ui/cover';
import { AudioPanel } from './ui/audioPanel';
import { bus, EV } from './events';
import { sound } from './audio';
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
  // 흐름: 알 부화 시네마틱(Phaser) → 카메라가 물러나며 대표 타이틀(움직임) → 게임 시작 → 1단계
  const cover = new CoverScreen(ui, () => bus.emit(EV.requestStart));
  // 시네마틱 중 화면 위 작은 UI: 건너뛰기 · 소리 안내
  let openingActive = false;
  const opUi = el('div', 'opening-ui hidden');
  const skipBtn = el('button', 'ap-open op-skip', '건너뛰기 ▶▶');
  skipBtn.type = 'button';
  skipBtn.addEventListener('click', () => bus.emit(EV.skipOpening));
  const soundHint = el('p', 'op-hint', '🔊 화면을 터치하면 소리가 켜져요');
  opUi.append(soundHint, skipBtn);
  ui.append(opUi);
  bus.on(EV.openingStart, () => {
    openingActive = true;
    opUi.classList.remove('hidden');
    soundHint.classList.toggle('hidden', sound.ready);
  });
  bus.on(EV.openingDone, (info: { instant: boolean }) => {
    openingActive = false;
    opUi.classList.add('hidden');
    cover.reveal(info.instant);
  });
  cover.onReplay = () => {
    cover.hide();
    game.scene.start('Opening');
  };
  const overlay = new Overlay(ui);
  const audioPanel = new AudioPanel(ui);
  cover.onAudioTest = () => audioPanel.open();
  overlay.onAudioTest = () => audioPanel.open();

  const size = computeSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#f8eac0',
    pixelArt: true,
    roundPixels: true,
    width: size.width * VIEW.renderScale,
    height: size.height * VIEW.renderScale,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { keyboard: false, mouse: false, touch: false },
    scene: [BootScene, GameScene, OpeningScene],
  });

  // 자동 테스트용: 주소 끝에 ?test 를 붙였을 때만 게임 객체를 노출
  if (new URLSearchParams(window.location.search).has('test')) {
    (window as unknown as { __gona: Phaser.Game }).__gona = game;
    (window as unknown as { __sound: typeof sound }).__sound = sound;
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
    if (target?.closest('button') || target?.closest('.audio-panel')) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    sound.unlock();
    // 시네마틱 중 터치: 소리만 켬 (건너뛰기는 버튼으로)
    if (openingActive) {
      sound.startMusic('title');
      soundHint.classList.add('hidden');
      return;
    }
    if (cover.isVisible) return; // 대표 타이틀은 '게임 시작' 버튼으로만 진행
    if (overlay.isGameOverVisible) return;
    bus.emit(EV.tap);
  };
  document.addEventListener('pointerdown', onPointer, { passive: false });

  // 데스크톱 테스트용 키보드
  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyW') {
      ev.preventDefault();
      sound.unlock();
      if (openingActive) bus.emit(EV.skipOpening);
      else if (cover.isVisible) cover.start();
      else if (overlay.isGameOverVisible) overlay.tryRetry();
      else bus.emit(EV.tap);
    } else if (ev.code === 'KeyP' || ev.code === 'Escape') {
      bus.emit(overlay.isPaused ? EV.requestResume : EV.requestPause);
    }
  });

  // 길게 누르기 메뉴, 더블탭 확대, 스크롤 방지
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // 앱 전환 시 자동 일시정지
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) bus.emit(EV.requestPause);
  });
}

void boot();
