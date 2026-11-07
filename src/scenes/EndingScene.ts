/**
 * 가족 엔딩 컷신 (B스타일 — 해 질 녘 버섯마을) — 게임 화면과 별개인 시네마틱 · 약 50초 → THE END
 *   배경: 엔딩 전용 저녁 버섯마을 (가로 320x180 · 세로 180x320, 창문·가로등 불빛) + 가로등 불빛 일렁임 · 꽃잎
 *   인물: 가족 6명 — 사람마다 따로 만든 도트 그림(PNG) 동작 시트 (tools/build_family_v3.py, 64x60 x 10동작, 몸·앞팔 분리)
 *         고나는 게임의 3단계 고나 그림(달리기 4프레임·깜짝·깜빡) + 같은 그림에서 눈·입만 바꾼 웃는 얼굴
 *         가족·고나 모두 1배 (도트 크기·외곽선 굵기 같음)
 *   카메라: 정수 배율만 (도트가 고르게) — 전체(Z0) / 한 단계 가까이(Z0+1)까지만. 얼굴만 잡는 과한 확대 없음
 *   세로: 위 노을·마을 / 가운데 가족과 고나 / 아래 자막 — 발이 자막 위에 오도록 카메라 높이를 계산
 *   가로: 자막은 위(하늘) — 머리가 자막 아래에 오도록
 *
 *   SCENE 01 노을의 버섯마을 (하늘·마을 → 돌길로 천천히)
 *   SCENE 02 가족을 발견한 고나 (고나 걸어와 멈춤 → 깜짝! → 활짝) — 가족은 세 줄로 모여 손 흔듦 (한 줄로 서지 않음)
 *   SCENE 03 고나의 달리기 (달리기 4프레임 · 통통 · 발밑 먼지) — 가족도 다가와 두 팔 벌림
 *   SCENE 04 가족의 품 (양옆에서 감싸 안음 — 팔은 고나보다 앞에 그림 · 고나 눈 감고 웃음 · 하트)
 *   SCENE 05 뽀뽀와 킁카 (볼에 쪽! · 머리에 코 대고 킁킁 → 고나 간지러워 꼼지락 · 뒷줄 두 사람이 머리 쓰다듬기)
 *   SCENE 06 단체 컷 → 천천히 멀어짐 → THE END (버튼: ui/endingUi.ts)
 * 그림은 모두 앱 시작 때 로드한 텍스처 + 가벼운 트윈. 씬이 끝나면 오브젝트·트윈·타이머 자동 정리.
 */
import Phaser from 'phaser';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';

export const ENDING_LINES: { at: number; text: string }[] = [
  { at: 1.0, text: '길고 길었던 고나의 모험이 끝나고,\n숲에는 따뜻한 저녁이 찾아왔어요.' },
  { at: 7.0, text: '그때, 고나가 가장 보고 싶었던\n사람들이 보였어요.' },
  { at: 13.6, text: '고나는 있는 힘껏\n가족을 향해 달려갔답니다.' },
  { at: 20.4, text: '아무리 커다란 모험을 하고 돌아와도,\n가족 품은 언제나 따뜻했어요.' },
  { at: 29.6, text: '무섭기만 했던 뽀뽀와 킁카도,\n가족의 사랑 앞에서는 가장 따뜻한 선물이 되었어요.' },
];
export const ENDING_THE_END_AT = 48;

/** 가족 (사진·스토리보드 속 외형으로 구분, 호칭 추정 안 함) */
export type FamId = 'stripe' | 'glasses' | 'ponytail' | 'blacktee' | 'curly' | 'grey';
export const FAM_IDS: FamId[] = ['stripe', 'glasses', 'ponytail', 'blacktee', 'curly', 'grey'];
/** 시트 칸 (tools/build_family_v3.py 의 POSES 순서) — 4~9 는 옆모습(오른쪽 보기), 왼쪽을 볼 땐 좌우 반전 */
const F = { idle: 0, laugh: 1, wave: 2, open: 3, walkA: 4, walkB: 5, hug: 6, kiss: 7, sniff: 8, pat: 9 };
const SIDE_FROM = F.walkA;
type Mode = 'idle' | 'laugh' | 'wave' | 'open' | 'walk' | 'hug' | 'kiss' | 'sniff' | 'pat';

interface Member {
  id: FamId;
  s: Phaser.GameObjects.Sprite;
  arms: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  tx: number;
  mode: Mode;
  then: Mode;
  phase: number;
  since: number;
  row: 0 | 1 | 2;
}

interface Layout {
  bg: string;
  W: number;
  H: number;
  c: number;
  /** 줄별 발 높이 [앞줄, 가운데 줄, 뒷줄] */
  rows: [number, number, number];
  /** 고나 둘레에 모였을 때 자리 (가운데 기준 x, 줄) */
  pos: Record<FamId, [number, 0 | 1 | 2]>;
  /** 쓰다듬을 때 다가가는 자리 */
  patPos: Partial<Record<FamId, number>>;
  /** 처음(고나가 오기 전) 가족이 모여 있는 곳 — 가운데에서 오른쪽으로 · 모인 간격 비율 */
  wait: number;
  waitSpread: number;
  gonaStart: number;
  gonaStop: number;
  /** 가로등 불빛 자리 */
  lamps: [number, number][];
}

const LAYOUTS: Record<'land' | 'port', Layout> = {
  land: {
    bg: 'end-bgB-land',
    W: 320,
    H: 180,
    c: 160,
    rows: [172, 164, 156],
    pos: { ponytail: [-22, 0], curly: [22, 0], stripe: [-44, 1], grey: [44, 1], glasses: [-24, 2], blacktee: [24, 2] },
    patPos: { glasses: -14, blacktee: 14 },
    wait: 72,
    waitSpread: 0.9,
    gonaStart: -24,
    gonaStop: 84,
    lamps: [[94, 41], [237, 41]],
  },
  port: {
    bg: 'end-bgB-port',
    W: 180,
    H: 320,
    c: 92,
    rows: [236, 226, 216],
    pos: { ponytail: [-22, 0], curly: [22, 0], stripe: [-40, 1], grey: [40, 1], glasses: [-22, 2], blacktee: [22, 2] },
    patPos: { glasses: -14, blacktee: 14 },
    wait: 26,
    waitSpread: 0.75,
    gonaStart: -24,
    gonaStop: 44,
    lamps: [[15, 116], [163, 116]],
  },
};

type Cue = { at: number; fn: () => void; done?: boolean };

export class EndingScene extends Phaser.Scene {
  /** 지난 시간(초) — (검증용) 바꿔서 빨리 감기 가능 */
  t = 0;
  sceneNo = 1;
  readonly family: Member[] = [];
  private cues: Cue[] = [];
  private L!: Layout;
  private portrait = false;
  private Z0 = 6;
  private gona!: Phaser.GameObjects.Sprite;
  gx = 0;
  private galt = 0;
  private gsq = 1;
  private gMode: 'walk' | 'run' | 'stand' | 'wow' | 'happy' | 'laugh' = 'walk';
  private wiggle = 0;

  constructor() {
    super('EndingCine');
  }

  create(): void {
    this.t = 0;
    this.sceneNo = 1;
    this.family.length = 0;
    this.cues = [];
    const cam = this.cameras.main;
    this.portrait = this.scale.height > this.scale.width;
    this.L = LAYOUTS[this.portrait ? 'port' : 'land'];
    const L = this.L;
    this.Z0 = Math.max(1, Math.ceil(Math.max(this.scale.width / L.W, this.scale.height / L.H)));
    cam.setZoom(this.Z0).setBounds(0, 0, L.W, L.H).setRoundPixels(true).setBackgroundColor('#2a1a3a');
    this.add.image(0, 0, L.bg).setOrigin(0, 0).setDepth(0);
    // 가로등 불빛 (미리 만든 둥근 빛 · 촛불처럼 은은하게 일렁임)
    for (const [i, [x, y]] of L.lamps.entries()) {
      const g = this.add.image(x, y, 'end-glow').setDepth(1).setScale(0.55).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: g, alpha: 0.75, scale: 0.62, duration: 900 + i * 230, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    // 작은 꽃잎 (개수 제한)
    this.add
      .particles(0, 0, 'end-petal', { frame: [0, 1], x: { min: 0, max: L.W + 20 }, y: -4, lifespan: 9000, speedX: { min: -10, max: -3 }, speedY: { min: 7, max: 14 }, rotate: { min: 0, max: 360 }, frequency: perf.low ? 700 : 380 })
      .setDepth(400);
    // 가족 — 처음엔 길 오른쪽에 세 줄로 모여 기다림 (한 줄로 서지 않음)
    FAM_IDS.forEach((id, i) => {
      const [dx, row] = L.pos[id];
      const x = Math.round(L.c + L.wait + dx * L.waitSpread);
      const y = L.rows[row];
      const s = this.add.sprite(x, y, `fam-${id}`, 0).setOrigin(0.5, 1);
      const arms = this.add.sprite(x, y, `fam-${id}-arms`, 0).setOrigin(0.5, 1);
      this.family.push({ id, s, arms, x, y, tx: x, mode: i % 2 ? 'laugh' : 'idle', then: 'idle', phase: (i * 0.37) % 1.2, since: 0, row });
    });
    this.gx = L.gonaStart;
    this.gona = this.add.sprite(this.gx, L.rows[0] + 1, 'dino', 0).setOrigin(0.5, 1);
    this.shot(L.c, L.H * (this.portrait ? 0.3 : 0.35), this.Z0, 0);
    cam.fadeIn(1200, 40, 20, 50);
    this.buildCues();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.family.length = 0;
      this.cues = [];
    });
  }

  private m(id: FamId): Member {
    return this.family.find((f) => f.id === id)!;
  }

  private at(at: number, fn: () => void): void {
    this.cues.push({ at, fn });
  }

  /** 한 단계 가까운 배율 — 화면에 인물 전신이 들어갈 만큼만 */
  private get ZM(): number {
    const z = this.Z0 + 1;
    return this.scale.height / z >= 92 ? z : this.Z0;
  }

  /** 배율 z 에서 발(ground)이 자막 위에, 머리가 화면 안에 오도록 카메라 가운데 y */
  private frameY(z: number): number {
    const vh = this.scale.height / z;
    const ground = this.L.rows[0];
    const top = this.portrait ? ground + 8 - vh * 0.7 : ground + 6 - vh;
    return top + vh / 2;
  }

  /** 카메라: (x, y) 가운데 · 정수 배율 z · dur 초 (0 = 컷) */
  private shot(x: number, y: number, z: number, dur: number): void {
    const cam = this.cameras.main;
    const L = this.L;
    const vw = this.scale.width / z;
    const vh = this.scale.height / z;
    const cx = Phaser.Math.Clamp(x, vw / 2, L.W - vw / 2);
    const cy = Phaser.Math.Clamp(y, vh / 2, L.H - vh / 2);
    if (dur <= 0) {
      cam.setZoom(z);
      cam.centerOn(cx, cy);
      return;
    }
    if (cam.zoom !== z) cam.zoomTo(z, dur * 1000, 'Sine.easeInOut');
    cam.pan(cx, cy, dur * 1000, 'Sine.easeInOut');
  }

  private act(id: FamId, mode: Mode): void {
    const f = this.m(id);
    f.mode = mode;
    f.since = this.t;
  }

  private walkTo(id: FamId, x: number, then: Mode): void {
    const f = this.m(id);
    f.tx = Math.round(x);
    f.then = then;
    f.mode = 'walk';
    f.since = this.t;
  }

  private line(i: number): void {
    const l = ENDING_LINES[i];
    const next = ENDING_LINES[i + 1]?.at ?? ENDING_THE_END_AT - 4;
    bus.emit(EV.prologueLine, { index: i, total: ENDING_LINES.length, text: l.text, seconds: Math.min(6, next - l.at) });
  }

  private buildCues(): void {
    const L = this.L;
    const Z0 = this.Z0;
    const ZM = this.ZM;
    const ground = L.rows[0];
    ENDING_LINES.forEach((l, i) => this.at(l.at, () => this.line(i)));
    // ── SCENE 01 노을의 버섯마을: 하늘·마을에서 돌길로 천천히
    this.at(0, () => sound.startMusic('ending'));
    this.at(0.3, () => this.shot(L.c, this.frameY(Z0), Z0, 4.8));
    // ── SCENE 02 가족을 발견한 고나: 고나가 걸어 들어와 멈춤 → 깜짝 → 활짝 / 가족이 손 흔듦
    this.at(5.2, () => {
      this.sceneNo = 2;
      this.gMode = 'walk';
      this.tweens.add({ targets: this, gx: L.gonaStop, duration: 2600, ease: 'Sine.Out', onComplete: () => (this.gMode = 'stand') });
    });
    this.at(8.6, () => {
      this.gMode = 'wow';
      this.hop(2);
      sound.warn();
      this.float('!', this.gx + 4, ground - 42, '#fff3a0');
    });
    this.at(10.0, () => {
      this.gMode = 'happy';
      this.hop(3);
      sound.catch();
    });
    (['blacktee', 'ponytail', 'grey', 'stripe', 'curly', 'glasses'] as FamId[]).forEach((id, i) => this.at(9.0 + i * 0.3, () => this.act(id, i % 3 === 2 ? 'laugh' : 'wave')));
    this.at(11.0, () => this.shot(L.c + L.wait * 0.5, this.frameY(ZM), ZM, 1.6));
    // ── SCENE 03 고나의 달리기: 달리기 4프레임 · 통통 · 먼지 / 가족도 걸어와 두 팔 벌림
    this.at(13.2, () => {
      this.sceneNo = 3;
      this.gMode = 'run';
      this.shot(L.c, this.frameY(Z0), Z0, 2.4);
      this.tweens.add({ targets: this, gx: L.c, duration: 5200, ease: 'Sine.InOut', onComplete: () => (this.gMode = 'laugh') });
    });
    for (const id of FAM_IDS) this.at(14.6 + Math.random() * 0.6, () => this.walkTo(id, L.c + L.pos[id][0], id === 'ponytail' || id === 'curly' ? 'open' : 'open'));
    // ── SCENE 04 가족의 품: 양옆에서 감싸 안음 (팔은 고나 앞) · 다른 가족도 둘러섬
    this.at(18.6, () => {
      this.sceneNo = 4;
      this.shot(L.c, this.frameY(ZM), ZM, 1.6);
    });
    this.at(19.6, () => {
      this.act('ponytail', 'hug');
      this.act('curly', 'hug');
      sound.catch();
      this.gsq = 0.88;
      this.gMode = 'laugh';
    });
    this.at(20.6, () => this.heart(L.c - 4, ground - 46));
    this.at(22.4, () => this.heart(L.c + 6, ground - 50));
    (['stripe', 'grey', 'glasses', 'blacktee'] as FamId[]).forEach((id, i) => this.at(22.0 + i * 0.5, () => this.act(id, 'laugh')));
    // ── SCENE 05 뽀뽀와 킁카: 볼에 쪽! · 머리에 코 대고 킁킁 · 뒷줄 두 사람이 머리 쓰다듬기
    this.at(28.6, () => {
      this.sceneNo = 5;
    });
    this.at(29.4, () => this.kiss('curly'));
    this.at(32.8, () => this.sniff('ponytail'));
    // 오른쪽 사람이 잠깐 비켜서고, 뒷줄 사람이 한 걸음 앞으로 나와(손이 고나 머리 높이) 머리를 토닥토닥
    this.at(34.4, () => this.walkTo('curly', L.c + L.pos.curly[0] + 14, 'laugh'));
    this.at(34.8, () => {
      const f = this.m('blacktee');
      this.walkTo('blacktee', L.c + (L.patPos.blacktee ?? 14), 'pat');
      this.tweens.add({ targets: f, y: ground - 7, duration: 600, ease: 'Sine.Out' });
    });
    this.at(35.2, () => this.act('glasses', 'laugh'));
    this.at(37.4, () => {
      const f = this.m('blacktee');
      this.walkTo('blacktee', L.c + L.pos.blacktee[0], 'laugh');
      this.tweens.add({ targets: f, y: L.rows[2], duration: 600, ease: 'Sine.Out' });
      this.walkTo('curly', L.c + L.pos.curly[0], 'hug');
    });
    this.at(38.4, () => this.kiss('curly'));
    // ── SCENE 06 단체 컷 → 천천히 멀어짐 → THE END
    this.at(40.0, () => {
      this.sceneNo = 6;
      for (const [i, id] of FAM_IDS.entries()) this.at(this.t + i * 0.15, () => this.act(id, id === 'ponytail' || id === 'curly' ? 'hug' : 'laugh'));
      this.gMode = 'laugh';
    });
    this.at(41.0, () => this.shot(L.c, this.frameY(Z0), Z0, 5.0));
    for (const t of [42.0, 44.0, 46.0]) this.at(t, () => this.hop(2));
    this.at(ENDING_THE_END_AT, () => bus.emit(EV.endingTheEnd));
  }

  private kiss(id: FamId): void {
    this.act(id, 'kiss');
    sound.smooch();
    const f = this.m(id);
    const side = f.x < this.gx ? -1 : 1;
    const hx = this.gx + side * 10;
    const hy = this.L.rows[0] - 30;
    this.float('쪽!', hx + side * 4, hy - 8, '#ff9fc4');
    this.heart(hx, hy - 2);
    this.gMode = 'laugh';
    // 고나가 볼을 내밀며 살짝 발돋움 (볼이 입술 높이에 닿게)
    this.tweens.add({ targets: this, galt: 6, duration: 180, yoyo: true, hold: 900, ease: 'Sine.Out' });
    this.at(this.t + 1.6, () => this.act(id, 'hug'));
  }

  private sniff(id: FamId): void {
    this.act(id, 'sniff');
    sound.inhale();
    const f = this.m(id);
    const side = f.x < this.gx ? -1 : 1;
    this.float('킁킁♡', this.gx + side * 12, this.L.rows[0] - 44, '#ffd0e2');
    this.at(this.t + 0.8, () => this.heart(this.gx + side * 4, this.L.rows[0] - 40));
    // 고나: 간지러워 꼼지락 + 웃음
    this.wiggle = 1.8;
    this.gMode = 'laugh';
    this.at(this.t + 2.0, () => this.act(id, 'hug'));
  }

  private dust(x: number, y: number): void {
    const d = this.add.image(x, y, 'fx-sparkle').setDepth(170).setTint(0xd8c8b0).setAlpha(0.8);
    this.tweens.add({ targets: d, x: x - 6, y: y - 4, alpha: 0, duration: 380, onComplete: () => d.destroy() });
  }

  private hop(px: number): void {
    this.tweens.add({ targets: this, galt: px, duration: 140, yoyo: true, ease: 'Sine.Out' });
  }

  private heart(x: number, y: number): void {
    const h = this.add.image(x, y, 'end-heart').setDepth(500);
    this.tweens.add({ targets: h, y: y - 12, alpha: 0, duration: 1300, ease: 'Sine.Out', onComplete: () => h.destroy() });
  }

  private float(text: string, x: number, y: number, color: string): void {
    const key = `end-ft:${color}:${text}`;
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d')!;
      g.font = '12px Galmuri11, monospace';
      c.width = Math.ceil(g.measureText(text).width) + 8;
      c.height = 18;
      g.font = '12px Galmuri11, monospace';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = '#3a1a3a';
      g.strokeText(text, 4, 9);
      g.fillStyle = color;
      g.fillText(text, 4, 9);
      this.textures.addCanvas(key, c);
    }
    const t = this.add.image(x, y, key).setDepth(510).setScale(0.5);
    this.tweens.add({ targets: t, y: y - 8, alpha: 0, duration: 1200, delay: 400, onComplete: () => t.destroy() });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 250) / 1000;
    this.t += dt;
    for (const c of this.cues) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        c.fn();
      }
    }
    this.wiggle = Math.max(0, this.wiggle - dt);
    this.gsq += (1 - this.gsq) * Math.min(1, dt * 6);
    // 고나 (게임의 3단계 고나 그림 'dino': 0 서기 · 1~4 달리기 · 6 깜빡 · 8 깜짝 / 'happy-walker' = 같은 그림에서 눈·입만 웃는 얼굴)
    let key = 'dino';
    let frame = 0;
    let bounce = 0;
    if (this.gMode === 'walk') {
      frame = 1 + (Math.floor(this.t * 7) % 4);
    } else if (this.gMode === 'run') {
      key = 'happy-walker';
      frame = 1 + (Math.floor(this.t * 12) % 4);
      bounce = Math.abs(Math.sin(this.t * 14)) * 1.5;
      if (Math.random() < dt * 9) this.dust(this.gx - 10, this.L.rows[0]);
    } else if (this.gMode === 'wow') frame = 8;
    else if (this.gMode === 'stand') frame = Math.floor(this.t / 2.4) % 6 === 0 ? 6 : 0;
    else {
      key = 'happy-walker';
      frame = 0;
    }
    if (!this.textures.exists(key)) key = 'dino';
    if (this.gona.texture.key !== key || this.gona.frame.name !== String(frame)) this.gona.setTexture(key, frame);
    const sy = this.gsq;
    this.gona.setScale(2 - sy, sy).setAngle(this.wiggle > 0 ? Math.sin(this.t * 32) * 4 : 0);
    this.gona.setPosition(Math.round(this.gx), Math.round(this.L.rows[0] + 1 - this.galt - bounce)).setDepth(180);
    for (const f of this.family) this.updateMember(f, dt);
  }

  private updateMember(f: Member, dt: number): void {
    const t = this.t + f.phase;
    let frame: number = F.idle;
    let bob = 0;
    let armDy = 0;
    let faceLeft = f.x > this.gx; // 옆모습 동작은 고나 쪽을 봄
    if (f.mode === 'walk') {
      const step = 26 * dt;
      if (Math.abs(f.tx - f.x) <= step) {
        f.x = f.tx;
        f.mode = f.then;
        f.since = this.t;
      } else {
        faceLeft = f.tx < f.x;
        f.x += Math.sign(f.tx - f.x) * step;
      }
      frame = Math.floor(t / 0.18) % 2 ? F.walkB : F.walkA;
    }
    switch (f.mode) {
      case 'idle':
        frame = F.idle;
        bob = Math.floor(t / 0.8) % 2;
        break;
      case 'laugh':
        frame = F.laugh;
        bob = Math.floor(t / 0.32) % 2;
        break;
      case 'wave':
        frame = Math.floor(t / 0.32) % 2 ? F.wave : F.idle;
        break;
      case 'open':
        frame = F.open;
        bob = Math.floor(t / 0.5) % 2;
        break;
      case 'hug':
        frame = F.hug;
        bob = Math.floor(t / 0.9) % 2;
        break;
      case 'kiss':
        frame = F.kiss;
        break;
      case 'sniff':
        frame = F.sniff;
        bob = Math.floor((this.t - f.since) / 0.2) % 2; // 킁킁 — 고개가 들썩
        break;
      case 'pat':
        frame = F.pat;
        armDy = Math.floor((this.t - f.since) / 0.25) % 2 ? 2 : 0; // 토닥토닥
        break;
      default:
        break;
    }
    const s = f.s;
    if (s.frame.name !== String(frame)) s.setFrame(frame);
    s.setFlipX(frame >= SIDE_FROM && faceLeft);
    const touching = f.mode === 'hug' || f.mode === 'kiss' || f.mode === 'sniff' || f.mode === 'pat';
    const base = [160, 130, 100][f.row];
    s.setDepth(base);
    const a = f.arms;
    if (a.frame.name !== String(frame)) a.setFrame(frame);
    // 감싸는 팔은 고나(180)보다 앞
    a.setFlipX(s.flipX).setDepth(touching ? 220 - f.row : base + 0.5);
    s.setPosition(Math.round(f.x), Math.round(f.y) - bob);
    a.setPosition(s.x, s.y + armDy);
  }
}
