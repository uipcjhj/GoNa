/**
 * 머리카락 부메랑: 머리에서 빠져 앞으로 빙글빙글 날아갔다가 돌아와 다시 붙음.
 * 돌아오기 전에는 다시 던질 수 없음. 무언가에 맞으면 바로 돌아옴.
 */
import Phaser from 'phaser';
import { sound } from '../../audio';

export type BoomerangState = 'held' | 'out' | 'back';

export class HairBoomerang {
  state: BoomerangState = 'held';
  x = 0;
  y = 0;
  /** 이번 던지기에서 이미 맞힌 대상 (한 번 던질 때 같은 대상은 한 번만) */
  readonly hitIds = new Set<string>();
  /** 몸에 다시 붙은 순간 (GameScene 이 '뽁' 연출에 사용) */
  onCaught: () => void = () => {};
  private sprite: Phaser.GameObjects.Image;
  private traveled = 0;
  private range = 120;
  private speed = 230;
  private returnSpeed = 260;
  private vx = 0;
  damage = 1;
  readonly r = 6;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, '__DEFAULT').setDepth(13).setVisible(false);
  }

  /** 돌아올 때까지 남은 정도 (1 = 막 던짐 → 0 = 돌아옴) */
  get remaining(): number {
    if (this.state === 'held') return 0;
    if (this.state === 'out') return 1 - 0.5 * Math.min(1, this.traveled / Math.max(1, this.range));
    return Math.min(0.5, 0.5 * (this.backDist / Math.max(1, this.range)));
  }
  private backDist = 0;
  /** 던진 횟수 (검증용) */
  throws = 0;

  get isOut(): boolean {
    return this.state !== 'held';
  }

  throw(texture: string, scale: number, x: number, y: number, stats: { range: number; speed: number; returnSpeed: number; damage: number }): boolean {
    if (this.state !== 'held') return false;
    this.state = 'out';
    this.throws++;
    this.hitIds.clear();
    this.x = x;
    this.y = y;
    this.traveled = 0;
    this.range = stats.range;
    this.speed = stats.speed;
    this.returnSpeed = stats.returnSpeed;
    this.damage = stats.damage;
    this.vx = this.speed;
    this.sprite.setTexture(texture).setScale(scale * 1.6).setVisible(true).setAngle(0).setPosition(x, y);
    sound.throw();
    return true;
  }

  /** 무언가에 맞음 → 돌아오기 */
  bounce(): void {
    if (this.state === 'out') this.state = 'back';
  }

  /** aimY = 날아가며 내려가는 높이 (보스 몸통·바위 높이) */
  update(dt: number, headX: number, headY: number, aimY: number = headY): void {
    if (this.state === 'held') return;
    if (this.state === 'out') {
      // 앞으로 날아가며 점점 느려짐
      const step = this.vx * dt;
      this.x += step;
      this.traveled += step;
      this.vx = Math.max(this.speed * 0.35, this.speed * (1 - this.traveled / (this.range * 1.4)));
      // 목표 높이로 비스듬히 내려감 (키 큰 고나가 던져도 작은 보스·바위에 맞게)
      this.y += (aimY - this.y) * Math.min(1, dt * 9);
      if (this.traveled >= this.range) this.state = 'back';
    } else {
      const dx = headX - this.x;
      const dy = headY - this.y;
      const d = Math.hypot(dx, dy);
      this.backDist = d;
      const v = this.returnSpeed * dt;
      if (d <= Math.max(5, v)) {
        this.catch();
        return;
      }
      this.x += (dx / d) * v;
      this.y += (dy / d) * v;
    }
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    this.sprite.angle -= 900 * dt;
  }

  private catch(): void {
    this.state = 'held';
    this.sprite.setVisible(false);
    sound.catch();
    this.onCaught();
  }

  /** 즉시 회수 (보스전 끝·필살기·죽음) */
  reset(): void {
    this.state = 'held';
    this.sprite.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.sprite.setVisible(v && this.state !== 'held');
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
