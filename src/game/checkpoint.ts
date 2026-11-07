/**
 * 진행 저장 (체크포인트) — 스토리 게임이라 보스를 깬 뒤 게임 오버가 나도 처음부터 하지 않게.
 *   'walker' : 뽀뽀괴물을 이기고 3단계가 된 지점 (머리카락 부메랑 있음)
 *   'sniff'  : 최종 보스 킁카괴물전에 들어가는 지점
 * 엔딩을 보면 지움. 최고 점수 기록은 따로(STORAGE_KEYS.best) 그대로 유지.
 * 저장소가 막힌 환경(미리보기 창 등)에서도 이번 실행 동안은 메모리에 남아 이어하기 가능.
 */
import { storage } from '../storage';

export type CheckpointId = 'walker' | 'sniff';

export interface Checkpoint {
  id: CheckpointId;
  score: number;
  snacks: number;
  at: number;
}

const KEY = 'gona.checkpoint';
let memory: Checkpoint | null = null;

export const CHECKPOINT_LABEL: Record<CheckpointId, string> = {
  walker: '3단계부터',
  sniff: '최종 보스부터',
};

export function loadCheckpoint(): Checkpoint | null {
  const raw = storage.get(KEY);
  if (raw) {
    try {
      const c = JSON.parse(raw) as Checkpoint;
      if (c && (c.id === 'walker' || c.id === 'sniff')) return c;
    } catch {
      /* 깨진 값 무시 */
    }
  }
  return memory;
}

export function saveCheckpoint(id: CheckpointId, score: number, snacks: number): void {
  memory = { id, score, snacks, at: Date.now() };
  storage.set(KEY, JSON.stringify(memory));
}

export function clearCheckpoint(): void {
  memory = null;
  if (storage.readOnly) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 저장 불가 환경 */
  }
}
