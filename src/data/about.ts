import aboutData from '../../content/settings/about.json';
import capabilityData from '../../content/settings/capabilities.json';
import careerData from '../../content/settings/career.json';
import processData from '../../content/settings/process.json';
import { clean } from '../lib/content';
import type { LinkItem } from './types';

/**
 * Career Highlights · About · Experience · Capabilities · How I Work 영역 데이터.
 * 내용은 content/settings/*.json 에 있고, 관리자 화면(/admin/)의 Settings 에서 고친다.
 * 경력의 period 에는 확인된 날짜만 적는다.
 */
export const highlights: { en: string; ko: string; to: string }[] = clean(aboutData.highlights);
export const about: { paragraphs: string[]; path: string[] } = clean({ paragraphs: aboutData.paragraphs, path: aboutData.path });
export const career: { period: string; organization: string; role: string; tasks: string[]; link?: LinkItem }[] = clean(careerData.items);
export const capabilities: { en: string; ko: string; to: string }[] = clean(capabilityData.items);
/** 사용 도구 목록 (숙련도 점수는 적지 않는다). 비어 있으면 화면에 나오지 않는다. */
export const tools: string[] = clean(capabilityData.tools as string[]);
export const process: { en: string; ko: string; text: string; project: { label: string; to: string } }[] = clean(processData.steps);
