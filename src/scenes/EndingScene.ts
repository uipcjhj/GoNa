/**
 * 가족 엔딩 컷신 (게임 화면과 별개의 '픽셀 애니메이션 영화' 마지막 장면) — 약 45초 → THE END
 *   엔딩 전용 배경(노을 버섯 마을, 가로·세로 따로) · 엔딩 전용 대형 캐릭터(가족 112x144 · 고나 타이틀 그림 약 76x98)
 *   카메라: 정수 배율(도트가 고르게) — 와이드 / 미디엄 / 클로즈업 컷 + 부드러운 이동·마지막 줌아웃
 *   세로 화면: 인물 중심 세로 구도(앞줄·뒷줄) / 가로 화면: 와이드 구도 + 위아래 시네마 띠(DOM)
 *
 *   SCENE 1 노을 하늘에서 마을 광장으로 천천히 내려옴 · 가족이 광장 가운데서 각자 움직이며 기다림
 *   SCENE 2 고나가 왼쪽에서 뛰어 들어옴 → 클로즈업: 깜짝(!) → 활짝 웃음
 *   SCENE 3 미디엄 샷: 가족들이 고나를 보고 웃으며 손 흔들기 · 두 팔 벌리기 (서로 다른 자세·타이밍)
 *   SCENE 4 고나가 달려가 품에 폭 — 엄마·아빠가 양옆에서 몸을 숙여 팔로 감싸 안음(팔이 고나 앞 층) · 카메라가 가까이
 *   SCENE 5 클로즈업: 엄마 볼 뽀뽀(쪽!) · 아빠 킁카(킁킁♡) · 삼촌·이모 쓰다듬기 — 고나는 눈 감고 웃다가 간지러워 움찔
 *   SCENE 6 단체 컷: 모두 고나를 둘러싸고 카메라를 보며 활짝 웃음 · 황금빛 반짝임 · 천천히 멀어짐 → 잠시 멈춤 → THE END
 * 그림은 모두 미리 만든 텍스처(앱 시작 때 로드) + 가벼운 트윈. 씬이 끝나면 Phaser 가 오브젝트·트윈·타이머를 모두 정리.
 */
import Phaser from 'phaser';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';
import { FAMILY_ORDER, FAMILY_NAME, type FamilyId } from '../art/familyArt';

export const ENDING_LINES: { at: number; text: string }[] = [
  { at: 1.2, text: '길고 길었던 고나의 모험이 드디어 끝났어요.' },
  { at: 7.2, text: '작은 알에서 태어난 고나는 어느새 이렇게 커다란 공룡이 되었답니다.' },
  { at: 13.4, text: '그런데 고나가 가장 만나고 싶었던 누군가가 있었어요.' },
  { at: 19.0, text: '고나는 세상에서 가장 소중한 사람들에게 달려갔어요.' },
  { at: 28.0, text: '아무리 커다란 공룡이 되어도,' },
  { at: 34.0, text: '가족에게 고나는 언제나 사랑스러운 아기였답니다.' },
];
export const ENDING_THE_END_AT = 45;

/** 가족 시트 프레임 (tools/build_family_cine.py) */
const F = { laugh: 0, laugh2: 1, waveA: 2, waveB: 3, open: 4, walkA: 5, walkB: 6, hug: 7, kiss: 8, sniffA: 9, sniffB: 10, patA: 11, patB: 12, giggle: 13 };
type Mode = 'idle' | 'wave' | 'open' | 'walk' | 'hug' | 'kiss' | 'sniff' | 'pat' | 'giggle';

interface Member {
  id: FamilyId;
  s: Phaser.GameObjects.Sprite;
  /** 앞쪽 팔 (포옹·뽀뽀·킁카·쓰다듬기 땐 고나 앞에) */
  arms: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  tx: number;
  mode: Mode;
  then: Mode;
  /** 왼쪽에 있는 사람은 오른쪽(고나 쪽)으로 기울이도록 좌우 반전 */
  flip: boolean;
  phase: number;
  since: number;
  row: 0 | 1 | 2;
}

/** 가로·세로 구도 (배경 좌표 = 도트 1칸) */
interface Layout {
  bg: string;
  W: number;
  H: number;
  c: number;
  /** 줄별 발 높이 [앞줄, 가운데 줄, 뒷줄] (원근: 뒤일수록 위) */
  rows: [number, number, number];
  front: number;
  /** 가족 자리 (가운데 기준 x, 줄) */
  pos: Record<FamilyId, [number, 0 | 1 | 2]>;
  /** 고나가 오기 전엔 가족이 조금 오른쪽에 모여 있음 (고나가 오면 걸어와 맞이함) */
  shift: number;
  /** 고나 뛰어 들어와 멈추는 곳 */
  gonaStop: number;
}

const LAYOUTS: Record<'land' | 'port', Layout> = {
  land: {
    bg: 'end-bg-land',
    W: 480,
    H: 268,
    c: 244,
    rows: [248, 238, 226],
    front: 248,
    pos: { mom: [-42, 0], dad: [42, 0], grandma: [-104, 1], grandpa: [104, 1], aunt: [-70, 2], uncle: [70, 2] },
    shift: 40,
    gonaStop: 112,
  },
  port: {
    bg: 'end-bg-port',
    W: 268,
    H: 480,
    c: 134,
    rows: [436, 408, 380],
    front: 436,
    pos: { mom: [-36, 0], dad: [36, 0], grandma: [-64, 1], grandpa: [64, 1], aunt: [-38, 2], uncle: [38, 2] },
    shift: 46,
    gonaStop: 70,
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
  private Z0 = 4;
  private gona!: Phaser.GameObjects.Image;
  private gx = 0;
  private galt = 0;
  private gsq = 1;
  private gMode: 'run' | 'stand' | 'wow' | 'laugh' | 'giggle' = 'run';
  private wiggle = 0;
  private glow!: Phaser.GameObjects.Image;

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
    // 배경이 화면을 꽉 채우는 가장 작은 정수 배율 (도트가 고르게)
    this.Z0 = Math.max(1, Math.ceil(Math.max(this.scale.width / L.W, this.scale.height / L.H)));
    cam.setZoom(this.Z0).setBounds(0, 0, L.W, L.H).setRoundPixels(true);
    cam.setBackgroundColor('#2a1a3a');
    this.add.image(0, 0, L.bg).setOrigin(0, 0).setDepth(0);
    // 해 주변 은은한 빛 (미리 만든 둥근 빛 한 장 · 숨 쉬듯)
    this.glow = this.add.image(L.W * (this.portrait ? 0.62 : 0.51), L.H * (this.portrait ? 0.29 : 0.41), 'end-glow').setDepth(1).setAlpha(0.35).setScale(this.portrait ? 1.1 : 1.4);
    this.tweens.add({ targets: this.glow, alpha: 0.6, scale: '+=0.12', duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add
      .particles(0, 0, 'end-petal', {
        frame: [0, 1],
        x: { min: 0, max: L.W + 40 },
        y: -6,
        lifespan: 9000,
        speedX: { min: -16, max: -4 },
        speedY: { min: 10, max: 20 },
        rotate: { min: 0, max: 360 },
        frequency: perf.low ? 420 : 220,
      })
      .setDepth(400);
    // 가족 (광장 가운데 · 앞줄/뒷줄)
    FAMILY_ORDER.forEach((id, i) => {
      const [dx, row] = L.pos[id];
      const x = L.c + dx + L.shift;
      const y = L.rows[row];
      const s = this.add.sprite(x, y, `endfam-${id}`, 0).setOrigin(0.5, 1);
      const arms = this.add.sprite(x, y, `endfam-${id}-arms`, 0).setOrigin(0.5, 1);
      this.family.push({ id, s, arms, x, y, tx: x, mode: 'idle', then: 'idle', flip: dx < 0, phase: (i * 0.41) % 1.3, since: 0, row });
      s.setName(FAMILY_NAME[id]);
    });
    this.gx = -60;
    this.gona = this.add.image(this.gx, L.front + 2, 'end-gona-walk1').setOrigin(0.5, 1);
    // 카메라: 노을 하늘에서 시작
    this.shot(L.c, this.portrait ? L.H * 0.3 : L.H * 0.35, this.Z0, 0);
    cam.fadeIn(1200, 255, 214, 150);
    this.buildCues();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.family.length = 0;
      this.cues = [];
    });
  }

  private m(id: FamilyId): Member {
    return this.family.find((f) => f.id === id)!;
  }

  private at(at: number, fn: () => void): void {
    this.cues.push({ at, fn });
  }

  /** 카메라: (x, y) 를 가운데로 · 정수 배율 z · dur 초 동안 부드럽게(0 = 컷) */
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

  /** 짧은 화면 전환 (금빛으로 살짝) 뒤 컷 */
  private cut(x: number, y: number, z: number): void {
    const cam = this.cameras.main;
    cam.flash(260, 255, 236, 200);
    this.shot(x, y, z, 0);
  }

  private act(id: FamilyId, mode: Mode): void {
    const f = this.m(id);
    f.mode = mode;
    f.since = this.t;
  }

  private walkTo(id: FamilyId, x: number, then: Mode): void {
    const f = this.m(id);
    f.tx = x;
    f.then = then;
    f.mode = 'walk';
    f.since = this.t;
  }

  private line(i: number): void {
    const l = ENDING_LINES[i];
    const next = ENDING_LINES[i + 1]?.at ?? ENDING_THE_END_AT;
    bus.emit(EV.prologueLine, { index: i, total: ENDING_LINES.length, text: l.text, seconds: Math.min(6, next - l.at) });
  }

  private buildCues(): void {
    const L = this.L;
    const Z0 = this.Z0;
    const ZM = Z0 + 1;
    const ZC = this.portrait ? Z0 + 3 : Z0 * 2;
    const headY = L.front - 66;
    ENDING_LINES.forEach((l, i) => this.at(l.at, () => this.line(i)));
    // ── SCENE 1: 노을 하늘 → 마을 광장으로 천천히
    this.at(0, () => sound.startMusic('ending'));
    this.at(0.4, () => this.shot(L.c, L.H, Z0, 5.0));
    FAMILY_ORDER.forEach((id, i) => this.at(2 + i * 0.4, () => this.act(id, i % 2 ? 'giggle' : 'idle')));
    // ── SCENE 2: 고나가 왼쪽에서 뛰어 들어옴 → 클로즈업 (깜짝 → 활짝)
    this.at(5.6, () => {
      this.sceneNo = 2;
      this.gMode = 'run';
      this.tweens.add({ targets: this, gx: L.gonaStop, duration: 3000, ease: 'Sine.Out', onComplete: () => (this.gMode = 'stand') });
      this.shot(L.c - (this.portrait ? 30 : 60), L.H, Z0, 2.4);
    });
    this.at(9.0, () => this.cut(L.gonaStop + 6, headY + 6, ZC));
    this.at(9.5, () => {
      this.gMode = 'wow';
      this.hop(4);
      sound.warn();
      this.spark(L.gonaStop + 18, headY - 20, 6);
    });
    this.at(11.0, () => {
      this.gMode = 'laugh';
      this.hop(6);
      sound.catch();
    });
    this.at(11.7, () => this.hop(6));
    // ── SCENE 3: 미디엄 샷 — 가족들이 반갑게 웃으며 손 흔들기 · 두 팔 벌리기
    this.at(12.8, () => {
      this.sceneNo = 3;
      this.cut(L.c, L.front - 62, ZM);
    });
    const waveOrder: FamilyId[] = ['mom', 'grandma', 'dad', 'aunt', 'grandpa', 'uncle'];
    waveOrder.forEach((id, i) => this.at(13.0 + i * 0.28, () => this.act(id, 'wave')));
    (['grandpa', 'aunt'] as FamilyId[]).forEach((id, i) => this.at(15.6 + i * 0.5, () => this.act(id, 'giggle')));
    (['mom', 'dad'] as FamilyId[]).forEach((id, i) => this.at(16.4 + i * 0.3, () => this.act(id, 'open')));
    // ── SCENE 4: 고나가 달려가 품에 폭 — 엄마·아빠가 한 걸음 다가와 몸을 숙여 감싸 안음
    this.at(18.4, () => {
      this.sceneNo = 4;
      this.cut(L.c - (this.portrait ? 10 : 30), L.front - 60, Z0);
      this.gMode = 'run';
      this.tweens.add({ targets: this, gx: L.c, duration: 2600, ease: 'Sine.In' });
      this.shot(L.c, L.front - 60, Z0, 2.6);
    });
    // 가족도 고나 쪽으로 걸어와 맞이함 (엄마·아빠는 고나 양옆으로 와서 안아 줌)
    this.at(19.2, () => {
      for (const id of FAMILY_ORDER) if (id !== 'mom' && id !== 'dad') this.walkTo(id, L.c + L.pos[id][0], 'open');
    });
    this.at(19.8, () => {
      this.walkTo('mom', L.c + L.pos.mom[0], 'hug');
      this.walkTo('dad', L.c + L.pos.dad[0], 'hug');
    });
    this.at(21.0, () => {
      // 마지막 한 걸음은 폴짝 뛰어 품으로
      this.gMode = 'laugh';
      this.tweens.add({ targets: this, galt: 10, duration: 200, yoyo: true, ease: 'Sine.Out' });
      sound.catch();
      this.gsq = 0.85;
    });
    this.at(21.6, () => this.shot(L.c, headY + 6, ZM, 1.2));
    for (let k = 0; k < 10; k++) this.at(21.8 + k * 0.5, () => this.heart(L.c + (Math.random() - 0.5) * 60, headY - 6 - Math.random() * 18));
    (['aunt', 'uncle'] as FamilyId[]).forEach((id, i) => this.at(22.4 + i * 0.4, () => this.act(id, 'open')));
    // ── SCENE 5: 클로즈업 — 볼 뽀뽀 · 킁카 · 쓰다듬기 (보스의 뽀뽀·킁카가 가족의 사랑으로)
    this.at(25.6, () => {
      this.sceneNo = 5;
      this.cut(L.c, headY + 4, ZC);
    });
    this.at(26.2, () => this.kiss('mom'));
    this.at(28.4, () => this.sniff('dad'));
    this.at(30.4, () => this.act('uncle', 'pat'));
    this.at(31.0, () => this.act('aunt', 'pat'));
    this.at(30.8, () => this.cut(L.c, headY - 4, ZM));
    this.at(32.4, () => this.kiss('dad'));
    this.at(33.6, () => this.sniff('mom'));
    (['grandma', 'grandpa'] as FamilyId[]).forEach((id, i) => this.at(30.2 + i * 0.6, () => this.act(id, 'giggle')));
    // ── SCENE 6: 단체 컷 — 모두 활짝 웃음 · 반짝임 · 천천히 멀어짐 → THE END
    this.at(35.6, () => {
      this.sceneNo = 6;
      this.cut(L.c, L.front - 64, ZM);
      FAMILY_ORDER.forEach((id, i) => this.at(this.t + i * 0.2, () => this.act(id, i % 3 === 1 ? 'giggle' : 'idle')));
      this.gMode = 'laugh';
    });
    this.at(36.6, () => this.shot(L.c, L.H, Z0, 4.5));
    for (let k = 0; k < 8; k++) this.at(36.4 + k * 0.6, () => this.spark(L.c + (Math.random() - 0.5) * 140, L.front - 40 - Math.random() * 70, 4));
    for (const t of [38.0, 40.2, 42.4]) this.at(t, () => this.hop(5));
    this.at(ENDING_THE_END_AT, () => bus.emit(EV.endingTheEnd));
  }

  private kiss(id: FamilyId): void {
    const f = this.m(id);
    this.act(id, 'kiss');
    sound.smooch();
    const hx = this.gx + (f.x < this.gx ? -6 : 14);
    const hy = this.L.front - 64;
    this.float('쪽!', hx, hy - 14, '#ff8fb8');
    this.heart(hx, hy);
    this.gMode = 'laugh';
    this.gsq = 0.9;
    this.at(this.t + 1.4, () => this.act(id, 'hug'));
  }

  private sniff(id: FamilyId): void {
    const f = this.m(id);
    this.act(id, 'sniff');
    sound.inhale();
    const hx = this.gx + (f.x < this.gx ? -10 : 16);
    this.float('킁킁♡', hx, this.L.front - 92, '#ffd0e2');
    for (let k = 0; k < 3; k++) this.at(this.t + 0.3 + k * 0.4, () => this.heart(hx + (Math.random() - 0.5) * 12, this.L.front - 80));
    this.wiggle = 1.6;
    this.gMode = 'giggle';
    this.at(this.t + 1.7, () => {
      this.act(id, 'hug');
      this.gMode = 'laugh';
    });
  }

  private hop(px: number): void {
    this.tweens.add({ targets: this, galt: px, duration: 150, yoyo: true, ease: 'Sine.Out' });
  }

  private heart(x: number, y: number): void {
    const h = this.add.image(x, y, 'end-heart').setDepth(500).setScale(1.5);
    this.tweens.add({ targets: h, y: y - 24, alpha: 0, duration: 1200, ease: 'Sine.Out', onComplete: () => h.destroy() });
  }

  private spark(x: number, y: number, n: number): void {
    for (let i = 0; i < (perf.low ? Math.ceil(n / 2) : n); i++) {
      const s = this.add.image(x, y, 'fx-sparkle').setDepth(500).setScale(1.5);
      const a = Math.random() * Math.PI * 2;
      this.tweens.add({ targets: s, x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 14, alpha: 0, duration: 700, onComplete: () => s.destroy() });
    }
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
      g.strokeStyle = '#6a2a3a';
      g.strokeText(text, 4, 9);
      g.fillStyle = color;
      g.fillText(text, 4, 9);
      this.textures.addCanvas(key, c);
    }
    const t = this.add.image(x, y, key).setDepth(510);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 1200, delay: 300, onComplete: () => t.destroy() });
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
    // 고나 (타이틀 공식 그림: 걷기 2장·총총·깜짝·웃음)
    let key = 'end-gona-laugh';
    let bounce = 0;
    if (this.gMode === 'run') {
      const f = Math.floor(this.t * 8) % 3;
      key = ['end-gona-walk1', 'end-gona-trot', 'end-gona-walk2'][f];
      bounce = Math.abs(Math.sin(this.t * 12)) * 3;
      if (Math.random() < dt * 8) this.spark(this.gx - 20, this.L.front - 2, 1);
    } else if (this.gMode === 'stand') key = 'end-gona-walk1';
    else if (this.gMode === 'wow') key = 'end-gona-surprise';
    else if (this.gMode === 'giggle') key = 'end-gona-laugh';
    if (this.gona.texture.key !== key) this.gona.setTexture(key);
    const sy = this.gsq;
    this.gona.setScale(2 - sy, sy).setAngle(this.wiggle > 0 ? Math.sin(this.t * 34) * 4 : 0);
    this.gona.setPosition(Math.round(this.gx), Math.round(this.L.front + 2 - this.galt - bounce));
    // 깊이: 뒷줄 < 고나 < 앞줄 (포옹·뽀뽀·킁카 중인 사람은 팔이 고나 앞으로)
    this.gona.setDepth(180);
    for (const f of this.family) this.updateMember(f, dt);
  }

  private updateMember(f: Member, dt: number): void {
    const t = this.t + f.phase;
    let frame: number = F.laugh;
    if (f.mode === 'walk') {
      const step = 40 * dt;
      if (Math.abs(f.tx - f.x) <= step) {
        f.x = f.tx;
        f.mode = f.then;
        f.since = this.t;
      } else f.x += Math.sign(f.tx - f.x) * step;
      frame = Math.floor(t / 0.18) % 2 ? F.walkB : F.walkA;
    }
    let bob = 0;
    switch (f.mode) {
      case 'idle':
        frame = Math.floor(t / 0.55) % 2 ? F.laugh2 : F.laugh;
        bob = frame === F.laugh2 ? 1 : 0;
        break;
      case 'giggle':
        frame = Math.floor(t / 0.3) % 2 ? F.giggle : F.laugh2;
        break;
      case 'wave':
        frame = Math.floor(t / 0.28) % 2 ? F.waveB : F.waveA;
        break;
      case 'open':
        frame = F.open;
        bob = Math.floor(t / 0.5) % 2;
        break;
      case 'hug':
        frame = F.hug;
        break;
      case 'kiss':
        frame = F.kiss;
        break;
      case 'sniff':
        frame = Math.floor((this.t - f.since) / 0.2) % 2 ? F.sniffB : F.sniffA;
        break;
      case 'pat':
        frame = Math.floor((this.t - f.since) / 0.26) % 2 ? F.patB : F.patA;
        break;
      default:
        break;
    }
    const s = f.s;
    if (s.frame.name !== String(frame)) s.setFrame(frame);
    // 기울이는 동작은 고나 쪽으로 (시트는 왼쪽으로 기울임 → 고나보다 왼쪽에 있으면 반전)
    s.setFlipX(f.x < this.gx || (this.sceneNo < 4 && f.flip));
    const touching = f.mode === 'hug' || f.mode === 'kiss' || f.mode === 'sniff' || f.mode === 'pat';
    // 몸: 뒷줄 < 가운데 줄 < 앞줄 < 고나 · 앞팔: 평소엔 몸 바로 위, 안거나 만질 땐 고나 앞
    const base = [160, 130, 100][f.row];
    s.setDepth(base);
    const a = f.arms;
    if (a.frame.name !== String(frame)) a.setFrame(frame);
    a.setFlipX(s.flipX).setDepth(touching ? 220 - f.row : base + 0.5);
    s.setPosition(Math.round(f.x), f.y - bob);
    a.setPosition(s.x, s.y);
  }
}
