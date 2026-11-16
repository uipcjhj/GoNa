import type { Project, StepContent, StepKey } from './types';

/**
 * 프로젝트 데이터. 화면 컴포넌트는 이 파일만 읽는다.
 *
 * 새 프로젝트 추가: 아래 배열에 객체를 하나 더 넣으면 목록·필터·상세 페이지(/work/<slug>/)가 자동으로 생긴다.
 * 이미지 교체: public/media/ 에 파일을 넣고 cover.src / steps.*.media.src 에 'media/파일명' 을 적는다.
 * placeholder: true 는 "임시" 표시. 실제 내용으로 바꾼 뒤 지운다.
 * 성과(Impact)에는 확인된 수치만 적는다.
 */

const guide: Record<StepKey, string> = {
  overview: '프로젝트가 무엇이었는지 한 문단으로 적어 주세요. 브랜드, 기간, 맡은 역할이 드러나면 좋습니다.',
  challenge: '어떤 문제나 목표에서 출발했는지 적어 주세요.',
  strategy: '문제를 어떻게 풀기로 했는지, 그렇게 판단한 근거는 무엇이었는지 적어 주세요.',
  execution: '실제로 만든 것과 진행 과정을 적어 주세요. 결과물 이미지나 영상을 함께 넣을 수 있습니다.',
  impact: '확인된 결과만 적어 주세요. 수치가 없다면 정성적인 변화나 후속 진행을 적습니다.',
  reflection: '잘된 점, 아쉬운 점, 다음에 다르게 할 점을 적어 주세요.',
};

function draftSteps(): Record<StepKey, StepContent> {
  const entries = (Object.keys(guide) as StepKey[]).map((key) => [
    key,
    {
      body: [guide[key]],
      placeholder: true,
      ...(key === 'execution' ? { media: { kind: 'image', alt: '실행 결과물 (임시 이미지)', ratio: '16 / 10' } } : {}),
    },
  ]);
  return Object.fromEntries(entries);
}

function draftProject(slug: string, title: string, category: Project['category'], ratio: string, featured = true): Project {
  return {
    slug,
    title,
    category,
    summary: '프로젝트를 한 문장으로 소개하는 자리입니다.',
    cover: { kind: 'image', alt: `${title} 대표 이미지 (임시)`, ratio },
    featured,
    placeholder: true,
    steps: draftSteps(),
  };
}

export const projects: Project[] = [
  draftProject('project-a', '프로젝트 제목 A', 'Digital Marketing', '16 / 10'),
  draftProject('project-b', '프로젝트 제목 B', 'Brand Content', '4 / 5'),
  draftProject('project-c', '프로젝트 제목 C', 'Video', '4 / 5'),
  draftProject('project-d', '프로젝트 제목 D', 'Digital Marketing', '16 / 10'),

  // ── AI Lab ────────────────────────────────────────────────
  {
    slug: 'gona-food-adventure',
    title: 'GONA’s Food Adventure',
    category: 'AI Lab',
    kind: 'Game',
    tools: ['Vite', 'TypeScript', 'Phaser 4', 'GitHub Pages'],
    summary: '모바일 브라우저에서 바로 실행되는 도트 감성의 횡스크롤 러너 게임.',
    cover: { kind: 'image', src: 'media/gona-cover.webp', alt: 'GONA’s Food Adventure 타이틀 화면', ratio: '16 / 10' },
    link: { label: '게임 플레이', href: 'https://uipcjhj.github.io/GoNa/' },
    steps: {
      // Overview · Execution 은 게임 저장소 README 를 근거로 쓴 초안이다. 본인 표현으로 다듬어 주세요.
      overview: {
        body: [
          '설치 없이 모바일 브라우저에서 바로 즐기는 횡스크롤 러너 게임입니다. 화면을 터치해 점프하고, 공중에서 한 번 더 터치하면 더블 점프를 합니다.',
          '딸기, 바나나, 쿠키를 먹어 점수를 얻고, 시간이 지날수록 속도가 빨라지며 장애물 패턴이 다양해집니다.',
        ],
      },
      challenge: { body: [guide.challenge], placeholder: true },
      strategy: { body: [guide.strategy], placeholder: true },
      execution: {
        body: [
          'Vite, TypeScript, Phaser 4로 만들었습니다. 알이 부화하는 오프닝, 움직이는 타이틀 화면, 보스전, 엔딩 영상까지 하나의 흐름으로 이어집니다.',
          '아이폰 Safari에서 영상과 배경음악이 정상적으로 재생되도록 맞췄고, 홈 화면에 추가해 앱처럼 실행할 수 있습니다.',
          'GitHub Pages에 정식 버전과 개발 버전을 나누어 배포하고, 배포 전에 필수 리소스가 빠지지 않았는지 자동으로 검사합니다.',
        ],
      },
      impact: { body: [guide.impact], placeholder: true },
      reflection: { body: [guide.reflection], placeholder: true },
    },
  },
  { ...draftProject('ai-automation-tool', 'AI 자동화 도구', 'AI Lab', '16 / 10', false), kind: 'Automation' },
  { ...draftProject('web-service', '웹서비스', 'AI Lab', '16 / 10', false), kind: 'Web Service' },
];

export const selectedWork = projects.filter((p) => p.featured && p.category !== 'AI Lab').slice(0, 4);
export const labProjects = projects.filter((p) => p.category === 'AI Lab');
export const findProject = (slug?: string) => projects.find((p) => p.slug === slug);
