/**
 * 회사 수치 파일의 양식 (이 파일에는 실제 수치를 적지 않는다).
 *
 * 사용법
 *   1. 이 파일을 같은 폴더에 `figures.local.ts` 라는 이름으로 복사한다.
 *      → `*.local.ts` 는 .gitignore 에 있어 저장소에 올라가지 않는다.
 *   2. 복사한 파일에 실제 수치를 적고 publish 값을 정한다.
 *   3. publish 가 true 인 항목만 화면과 빌드 결과물에 들어간다.
 *
 * 공개하기로 최종 결정한 뒤 저장소에서 함께 관리하려면, 그때 .gitignore 의 해당 줄을 지우고 커밋한다.
 * 파일이 없으면(지금 상태, 그리고 GitHub 에서 자동 빌드할 때) 수치는 어디에도 나오지 않는다.
 */
import type { PrivateFigures } from '../figures';

const figures: PrivateFigures = {
  channelKpi: {
    publish: false,
    asOf: 'YYYY.MM.DD',
    summary: { met: 0, total: 0, label: '' },
    channels: [
      { name: 'YouTube', items: [{ label: '조회수', value: '0', versusTarget: 100 }, { label: '구독자 순증', value: '+0' }] },
      { name: 'LinkedIn', items: [{ label: '팔로워 순증', value: '+0' }, { label: '노출수', value: '0' }] },
      { name: 'Instagram', items: [{ label: '팔로워 순증', value: '+0' }, { label: '노출수', value: '0' }] },
    ],
  },
  exhibitionChanges: {
    publish: false,
    note: '전시 전후의 채널 규모 변화입니다. 같은 기간의 다른 활동도 영향을 주므로 전시만의 직접 효과로 볼 수는 없습니다.',
    sets: [
      { title: 'AW 2026 전후', items: [{ label: 'YouTube', percent: 0 }, { label: 'Instagram', percent: 0 }, { label: 'LinkedIn', percent: 0 }] },
      { title: 'MODEX 2026 전후', items: [{ label: 'YouTube', percent: 0 }, { label: 'Instagram', percent: 0 }, { label: 'LinkedIn', percent: 0 }] },
    ],
  },
  // 집계 기간과 원본 자료를 확인한 수치만 적는다. 기준 시점이 다른 수치는 한 묶음에 섞지 않는다.
  kdmesGrowth: {
    publish: false,
    note: '집계 기간: YYYY.MM – YYYY.MM',
    sets: [
      { title: 'YouTube', items: [{ label: '조회수', percent: 0 }, { label: '시청시간', percent: 0 }, { label: '구독자', percent: 0 }] },
      { title: 'Instagram', items: [{ label: '팔로워', percent: 0 }, { label: '노출수', percent: 0 }] },
    ],
  },
};

export default figures;
