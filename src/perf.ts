/**
 * 성능 측정 (프레임 타임 · 끊김 원인 기록).
 *
 * 켜는 법: 주소 끝에 ?perf  또는  타이틀 화면 테스트 메뉴의 '성능 표시'
 * 화면 왼쪽 위에 FPS · 프레임 시간(평균/95%/최대) · 최근 '끊긴 프레임' 목록이 나오고,
 * 각 끊긴 프레임마다 그 프레임에 있었던 일(터치 처리·효과음·게임 계산·그리기 시간)을 보여 줍니다.
 * '복사' 버튼으로 기록 전체를 클립보드에 복사할 수 있습니다.
 *
 *   step   = Phaser 게임 계산(update) 시간
 *   render = Phaser 그리기(WebGL 명령) 시간
 *   js     = 그 프레임의 터치 처리·효과음 등 (아래 이벤트 합)
 *   gap    = 프레임 간격 - (step + render) → 브라우저 합성·GC·오디오 스레드 등 바깥 시간
 */

export interface PerfEvent {
  name: string;
  ms: number;
}

export interface LongFrame {
  at: number;
  dt: number;
  step: number;
  render: number;
  events: PerfEvent[];
}

const LONG_MS = 25;
const HISTORY = 240;

/** 구간(장면)별 프레임 기록 — 오프닝 문장마다·타이틀·게임 등 (perf.section 으로 바꿈) */
export interface PerfSection {
  name: string;
  frames: number;
  sum: number;
  max: number;
  over25: number;
  over50: number;
  over100: number;
  /** p95 계산용 (최대 600개) */
  dts: number[];
}

class Perf {
  enabled: boolean;
  /** 저사양 모드: 계속 느리면 자동으로 켜짐 (먼지 꼬리·반짝이 줄임) */
  low = false;
  private frameEvents: PerfEvent[] = [];
  private dts: number[] = [];
  readonly long: LongFrame[] = [];
  private last = 0;
  private stepStart = 0;
  private renderStart = 0;
  private step = 0;
  private render = 0;
  private panel: HTMLDivElement | null = null;
  private slowSince = 0;
  private uiT = 0;
  /** 전체 기록 (테스트·복사용) */
  frames = 0;
  /** 게임 계산·그리기 누적 (평균용) */
  private sumStep = 0;
  private sumRender = 0;
  private sumN = 0;
  private sumDt = 0;
  maxDt = 0;
  /** 구간별 기록 (최근 24개) */
  readonly sectionLog: PerfSection[] = [];
  private sec: PerfSection | null = null;

  constructor() {
    const q = new URLSearchParams(window.location.search);
    // 성능 표시(개발용)는 개발 빌드에서만 — 정식에서는 측정(저사양 판정)만 하고 화면 표시는 없음
    let on = __DEV_TOOLS__ && q.has('perf');
    try {
      on = on || (__DEV_TOOLS__ && window.localStorage.getItem('gona.perf') === '1');
    } catch {
      /* 저장소 없음 */
    }
    this.enabled = on;
    // 측정은 항상(가벼움): 저사양 자동 판정에도 사용. 화면 표시는 enabled 일 때만
    const loop = (t: number): void => {
      if (this.last) this.onFrame(t - this.last);
      this.last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if (on) document.addEventListener('DOMContentLoaded', () => this.mountPanel());
    if (on && document.readyState !== 'loading') this.mountPanel();
  }

  /** 이번 프레임에 있었던 일 기록 */
  mark(name: string, ms = 0): void {
    if (this.frameEvents.length < 20) this.frameEvents.push({ name, ms: Math.round(ms * 10) / 10 });
  }

  /** 동기 실행 시간을 재며 실행 */
  time<T>(name: string, fn: () => T): T {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      this.mark(name, performance.now() - t0);
    }
  }

  /** 지금부터 새 구간 (예: '오프닝 1/10') — 프레임 시간·끊김을 구간별로 모음 */
  section(name: string): void {
    if (this.sec?.name === name) return;
    this.sec = { name, frames: 0, sum: 0, max: 0, over25: 0, over50: 0, over100: 0, dts: [] };
    this.sectionLog.push(this.sec);
    if (this.sectionLog.length > 24) this.sectionLog.shift();
    this.mark(`▶ ${name}`);
  }

  /** 구간별 요약 */
  sections(): { name: string; frames: number; fps: number; avg: number; p95: number; max: number; over25: number; over50: number; over100: number }[] {
    return this.sectionLog.map((c) => {
      const d = [...c.dts].sort((a, b) => a - b);
      const avg = c.sum / Math.max(1, c.frames);
      return { name: c.name, frames: c.frames, fps: Math.round(1000 / Math.max(1, avg)), avg: r1(avg), p95: r1(d[Math.floor(d.length * 0.95)] ?? 0), max: r1(c.max), over25: c.over25, over50: c.over50, over100: c.over100 };
    });
  }

  /** Phaser 게임 루프에 연결 (main.ts) */
  attach(events: { on: (e: string, fn: () => void) => void }): void {
    events.on('prestep', () => (this.stepStart = performance.now()));
    events.on('poststep', () => (this.step = performance.now() - this.stepStart));
    events.on('prerender', () => (this.renderStart = performance.now()));
    events.on('postrender', () => (this.render = performance.now() - this.renderStart));
  }

  private onFrame(dt: number): void {
    this.frames++;
    const sc = this.sec;
    if (sc && dt < 1000) {
      sc.frames++;
      sc.sum += dt;
      if (dt > sc.max) sc.max = dt;
      if (dt > 25) sc.over25++;
      if (dt > 50) sc.over50++;
      if (dt > 100) sc.over100++;
      if (sc.dts.length < 600) sc.dts.push(dt);
    }
    this.dts.push(dt);
    this.sumDt += dt;
    if (this.dts.length > HISTORY) this.sumDt -= this.dts.shift()!;
    this.sumStep += this.step;
    this.sumRender += this.render;
    this.sumN++;
    // 탭이 백그라운드였던 긴 공백(>500ms)은 끊김으로 치지 않음
    if (dt > LONG_MS && dt < 500) {
      this.maxDt = Math.max(this.maxDt, dt);
      this.long.unshift({ at: Math.round(performance.now()), dt: r1(dt), step: r1(this.step), render: r1(this.render), events: this.frameEvents });
      if (this.long.length > 40) this.long.pop();
    }
    this.frameEvents = [];
    // 저사양 자동 판정: 3초 넘게 평균 22ms(약 45fps) 이상이면 (매 프레임 배열을 새로 만들지 않게 누적 합 사용)
    const avg = this.sumDt / this.dts.length;
    const now = performance.now();
    if (avg > 22 && this.dts.length >= 60) {
      if (!this.slowSince) this.slowSince = now;
      else if (now - this.slowSince > 3000 && !this.low) {
        this.low = true;
        this.mark('저사양 모드 켜짐');
      }
    } else this.slowSince = 0;
    if (this.panel && now - this.uiT > 500) {
      this.uiT = now;
      this.renderPanel();
    }
  }

  /** 프레임당 평균 게임 계산(step)·그리기(render) ms */
  costs(): { step: number; render: number; frames: number } {
    return { step: r1(this.sumStep / Math.max(1, this.sumN) * 10) / 10, render: r1(this.sumRender / Math.max(1, this.sumN) * 10) / 10, frames: this.sumN };
  }

  stats(): { fps: number; avg: number; p95: number; max: number; long: number; low: boolean } {
    const d = [...this.dts].sort((a, b) => a - b);
    const avg = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
    return {
      fps: Math.round(1000 / Math.max(1, avg)),
      avg: r1(avg),
      p95: r1(d[Math.floor(d.length * 0.95)] ?? 0),
      max: r1(d[d.length - 1] ?? 0),
      long: this.long.length,
      low: this.low,
    };
  }

  reset(): void {
    this.long.length = 0;
    this.dts = [];
    this.sumDt = 0;
    this.sumStep = 0;
    this.sumRender = 0;
    this.sumN = 0;
    this.maxDt = 0;
  }

  report(): string {
    const s = this.stats();
    const lines = [`FPS ${s.fps} · 평균 ${s.avg}ms · 95% ${s.p95}ms · 최대 ${s.max}ms · 끊김(>${LONG_MS}ms) ${s.long}회 · 저사양 ${s.low ? '켜짐' : '꺼짐'}`, navigator.userAgent];
    const secs = this.sections();
    if (secs.length) {
      lines.push('— 구간별 (프레임 · 평균 · 95% · 최대 ms · 끊김 >25/>50/>100ms) —');
      for (const c of secs) lines.push(`${c.name}: ${c.frames}f · ${c.avg} · ${c.p95} · ${c.max} · ${c.over25}/${c.over50}/${c.over100}`);
      lines.push('— 최근 끊긴 프레임 —');
    }
    for (const f of this.long) {
      const ev = f.events.map((e) => (e.ms ? `${e.name} ${e.ms}ms` : e.name)).join(', ');
      lines.push(`${f.dt}ms = step ${f.step} + render ${f.render} + 바깥 ${r1(f.dt - f.step - f.render)} | ${ev || '-'}`);
    }
    return lines.join('\n');
  }

  private pre: HTMLPreElement | null = null;

  /** 화면 표시 켜기/끄기 (새로고침 없이) */
  show(on: boolean): void {
    this.enabled = on;
    if (on) this.mountPanel();
    else {
      this.panel?.remove();
      this.panel = null;
    }
  }

  private mountPanel(): void {
    if (this.panel) return;
    const p = document.createElement('div');
    p.className = 'perf-panel';
    this.pre = document.createElement('pre');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '복사';
    copy.addEventListener('click', () => {
      const text = this.report();
      const done = (): void => {
        copy.textContent = '복사됨';
        window.setTimeout(() => (copy.textContent = '복사'), 1500);
      };
      if (navigator.clipboard) void navigator.clipboard.writeText(text).then(done, () => window.prompt('기록', text));
      else window.prompt('기록', text);
    });
    const clr = document.createElement('button');
    clr.type = 'button';
    clr.textContent = '지우기';
    clr.addEventListener('click', () => this.reset());
    p.append(this.pre, copy, clr);
    document.body.append(p);
    this.panel = p;
  }

  private renderPanel(): void {
    const s = this.stats();
    const c = this.sec;
    const head = `FPS ${s.fps} · avg ${s.avg} · p95 ${s.p95} · max ${s.max}ms${s.low ? ' · LOW' : ''}${c ? `\n[${c.name}] max ${r1(c.max)} · >50ms ${c.over50}` : ''}`;
    const rows = this.long
      .slice(0, 6)
      .map((f) => {
        const ev = f.events.map((e) => (e.ms ? `${e.name} ${e.ms}` : e.name)).join(', ');
        return `${f.dt}ms s${f.step} r${f.render} | ${ev || '-'}`;
      })
      .join('\n');
    if (this.pre) this.pre.textContent = `${head}\n${rows}`;
  }
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

export const perf = new Perf();

/** 테스트 메뉴에서 켜고 끄기 (바로 적용 + 가능하면 다음에도 기억) */
export function setPerfOverlay(on: boolean): void {
  perf.show(on);
  try {
    window.localStorage.setItem('gona.perf', on ? '1' : '0');
  } catch {
    /* 저장소 없음 */
  }
}
