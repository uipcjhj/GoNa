import type { Changes, Metrics } from './types';

/**
 * 회사 수치(채널 KPI, 전시 전후 변화율, 이전 직장 채널 성장률) 불러오기.
 *
 * 수치는 저장소에 없다. `private/figures.local.ts`(저장소에 올라가지 않는 파일)가 있고
 * 그 안에서 publish: true 로 표시한 항목만 화면과 빌드에 들어간다. 양식은 private/figures.example.ts.
 */
export interface PrivateFigures {
  channelKpi?: Metrics & { publish: boolean };
  exhibitionChanges?: Changes & { publish: boolean };
  /** 극동MES YouTube·Instagram 채널 성장률 */
  kdmesGrowth?: Changes & { publish: boolean };
}

const files = import.meta.glob<{ default: PrivateFigures }>('./private/*.local.ts', { eager: true });
const local = Object.values(files)[0]?.default;

const published = <T extends { publish: boolean }>(item?: T): Omit<T, 'publish'> | undefined => {
  if (!item?.publish) return undefined;
  const { publish: _publish, ...rest } = item;
  return rest;
};

export const channelKpi = published(local?.channelKpi) as Metrics | undefined;
export const exhibitionChanges = published(local?.exhibitionChanges) as Changes | undefined;
export const kdmesGrowth = published(local?.kdmesGrowth) as Changes | undefined;
