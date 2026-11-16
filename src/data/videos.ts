import type { Media } from './types';

/** YouTube 썸네일 주소. 저장소에 복사하지 않고 YouTube 에서 불러온다. */
export const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

/**
 * 공식 YouTube 채널에 공개된 영상 한 개. id 와 제목은 채널에서 직접 확인한 것만 적는다 (2026-11-16 확인).
 * 프로젝트 상세와 Creative Archive 가 같은 데이터를 함께 쓴다.
 */
export const yt = (id: string, title: string, published?: string): Media => ({
  kind: 'youtube',
  src: id,
  alt: title,
  caption: published ? `${title} (${published} 게시)` : title,
  poster: thumb(id),
  ratio: '16 / 9',
});

/**
 * 바다로요트 공식 채널(youtube.com/@BadaroYacht)의 영상 6편: 재직 당시 운영 채널의 콘텐츠 사례.
 * 2026-11-16 채널 목록에 모두 '1년 전'(2024.11~2025.11 게시)으로 표시됐다.
 * 영상별 직접 제작 여부는 미확인 — 확인 전에는 개인 기여도를 적지 않는다.
 */
export const badaroVideos: Media[] = [
  yt('1kQew3POth4', '★한국 상륙!★ 피이 보트 발뻗고 누워봤습니다. 라이노490 PE 레저 보트 공간 미쳤다'),
  yt('wuuJOpOl6tw', '요즘 카약은 이렇게 나온다고? 1인용·2인용 변신! | 하이보 분할형 카약 언박싱'),
  yt('fzs8aDx7BwI', '물 아무리 넣어도, 쏠려도 안침몰함.. 요즘 PE 불침선 미쳤다 | HDPE보트'),
  yt('zJycMdcqGMY', '한국 출시해도 될까..? 중국 박람회에서 ‘가성비 미쳤다’는 PE보트 발견함 | HDPE보트'),
  yt('kf8Pj010BW8', '요트회사가 만든 인산철 배터리, 정말 다를까?'),
  yt('pDNXL-XOIbY', '내 보트가 이렇게 편해질 줄이야.. 롤바부터 핸드레일까지 액세서리 총집합!'),
];
