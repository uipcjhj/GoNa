import { channelKpi, exhibitionChanges, kdmesGrowth } from './figures';
import type { Project } from './types';

/**
 * 프로젝트 데이터. 화면 컴포넌트는 이 파일만 읽는다.
 *
 * - 새 프로젝트: 배열에 객체를 추가하면 목록·필터·상세 페이지(/work/<slug>/)가 자동으로 생긴다.
 * - 상세 페이지 순서: Hero → Key Information(scope) → Featured Results(featured) → Process(process) → Outcome(outcome).
 *   내용이 없는 영역은 화면에 나오지 않는다.
 * - scope 는 맡은 일을 성격별로 나눈 것. 직접 한 일과 협업·지원한 일을 섞지 않는다.
 * - outcome.done 에는 끝난 결과만, 진행 중이거나 기획 단계인 것은 outcome.ongoing 에 적는다.
 * - 배열 순서가 곧 사이트의 프로젝트 번호(01~10)다.
 * - 회사 수치(KPI, 전시 전후 변화율, 채널 성장률)는 이 파일에 적지 않는다. data/figures.ts 설명 참고.
 * - 자료: public/media/<slug>/ 에 넣고 cover / featured.media / process.media 에 적는다.
 *   회사 자료는 외부 공개 가능 여부를 확인한 뒤에 올린다.
 */
export const projects: Project[] = [
  // ── 01 ────────────────────────────────────────────────────
  {
    slug: 'b2b-digital-marketing',
    title: 'B2B Digital Marketing & Growth',
    category: 'Digital Strategy / Growth',
    filter: 'Growth',
    period: '2025–2026',
    organization: 'HYUNDAI MOVEX',
    summary: '글로벌 디지털 채널의 콘텐츠 전략을 체계화하고, 데이터 기반 운영을 통해 브랜드의 디지털 접점을 확장했습니다.',
    cover: { kind: 'type', headline: ['YouTube', 'LinkedIn', 'Instagram'], caption: 'Global channels, 2025–2026', tone: 'ink' },
    header: 'split',
    placement: 'selected',
    scope: [
      { label: '운영', items: ['YouTube, LinkedIn, Instagram 공식 채널 운영', '영문 LinkedIn 콘텐츠 운영'] },
      { label: '전략·기획', items: ['글로벌 디지털 콘텐츠 전략 및 실행', '유튜브 콘텐츠 재생목록 체계화'] },
      { label: '제작·최적화', items: ['제목, 설명, 썸네일 및 SEO 최적화', '롱폼·숏폼 콘텐츠 재가공'] },
      { label: '분석·보고', items: ['KPI 관리 및 성과 보고'] },
    ],
    process: {
      challenge: '세 개의 채널에 흩어진 콘텐츠를 하나의 전략 아래 체계화하고, 운영 결과를 데이터로 확인하고 보고할 수 있는 구조가 필요했습니다.',
      approach: [
        '유튜브 재생목록을 체계화해 콘텐츠를 찾기 쉽게 정리',
        '제목, 설명, 썸네일을 검색에 맞춰 최적화',
        '롱폼 콘텐츠를 숏폼으로 재가공해 하나의 소재를 여러 접점에서 활용',
        '영문 LinkedIn 콘텐츠로 글로벌 고객과의 접점 확보',
      ],
    },
    outcome: channelKpi ? { metrics: channelKpi } : { note: '채널 KPI 수치는 공개 범위를 확인한 뒤 게시합니다.' },
  },

  // ── 02 ────────────────────────────────────────────────────
  {
    slug: 'product-storytelling',
    title: 'Product Storytelling — 4WS & MGF',
    category: 'Product Content / Video Production',
    filter: 'Content',
    period: '2026',
    organization: 'HYUNDAI MOVEX',
    summary: '복잡한 물류자동화 기술을 고객이 이해하기 쉬운 시각적 콘텐츠로 전환했습니다.',
    cover: { kind: 'type', headline: ['4WS', '& MGF'], caption: 'Product film / 3D / Shorts', tone: 'wash', motif: 'frames' },
    header: 'split',
    placement: 'selected',
    scope: [
      { label: '기획', items: ['4-Way Shuttle 홍보영상 기획', '실사와 3D 기반 제품 스토리 구성'] },
      { label: '검수', items: ['랙 구조, 이송 동선, 공간효율 등 기술 표현 검토', '제품 담당 부서와 제작사 검수 협업'] },
      { label: '제작 협업', items: ['MGF 3D 및 Shorts 콘텐츠 제작 협업'] },
      { label: '제작', items: ['제품 기술 형상에 맞는 썸네일 재제작', '국·영문 설명 및 홍보 문구 제작'] },
    ],
    process: {
      challenge: '정확한 기술정보와 이해하기 쉬운 시각적 메시지 사이의 균형을 잡아야 했습니다.',
      shift: { from: '기능 중심 설명', to: '고객 가치 중심 스토리텔링' },
    },
    outcome: {
      done: ['제품 홍보영상, 스토리보드, 썸네일 및 파생 콘텐츠 제작·검수'],
    },
  },

  // ── 03 · 극동MES ──────────────────────────────────────────
  {
    slug: 'youtube-social-growth',
    title: 'YouTube & Social Growth',
    category: 'Content Marketing / Social Media',
    filter: 'Content',
    period: '2022–2025',
    organization: '극동MES',
    summary: '콘텐츠의 기획부터 촬영, 편집, 발행, 성과 관리까지 직접 실행하며 브랜드의 디지털 채널을 성장시켰습니다.',
    cover: { kind: 'type', headline: ['YouTube', '& Social'], caption: 'Plan, shoot, edit, publish', tone: 'ink', motif: 'play' },
    placement: 'selected',
    scope: [
      { label: '기획', items: ['YouTube 영상 콘텐츠 기획', 'Instagram 카드뉴스·숏폼·브랜드 콘텐츠 기획'] },
      { label: '제작', items: ['영상 촬영·편집·업로드', '카드뉴스·Shorts·Reels 제작', 'Badaro Yacht 관련 콘텐츠 제작'] },
      { label: '운영', items: ['YouTube·Instagram 공식 채널 운영', '월 2회 YouTube 영상 정기 발행'] },
      { label: '분석·보고', items: ['채널별 성장 지표 분석', '월별 성과 분석 및 콘텐츠 운영 성과 보고'] },
    ],
    process: {
      challenge: '브랜드가 제공하는 제품과 서비스를 고객에게 알리고, 지속적인 콘텐츠 발행을 통해 브랜드 인지도와 관심을 확대해야 했습니다.',
      approach: [
        '정기적인 콘텐츠 발행 체계',
        '고객이 관심을 가질 만한 주제 기획',
        '영상과 카드뉴스의 멀티채널 활용',
        '월별 성과 분석 및 콘텐츠 개선',
      ],
      flow: ['기획', '촬영', '편집', '발행', '성과 분석'],
    },
    outcome: {
      done: ['정기적인 콘텐츠 제작과 YouTube·Instagram 채널 운영 수행', '채널 성장 성과 확보'],
      ...(kdmesGrowth ? { changes: kdmesGrowth } : { note: '채널 성장 수치는 집계 기간과 증빙을 확인한 뒤 게시합니다.' }),
    },
  },

  // ── 04 ────────────────────────────────────────────────────
  {
    slug: 'global-exhibition-marketing',
    title: 'Global Exhibition Marketing',
    category: 'Exhibition / Global Communication',
    filter: 'Content',
    period: '2026',
    organization: 'HYUNDAI MOVEX',
    summary: '글로벌 전시회의 사전 홍보부터 현장 콘텐츠, 사후 디지털 커뮤니케이션까지 연결했습니다.',
    cover: { kind: 'type', headline: ['AW', 'MODEX', 'WAC'], caption: 'Global exhibitions 2026', tone: 'signal' },
    placement: 'selected',
    scope: [
      { label: '홍보', items: ['국·영문 전시 사전 홍보 (AW)', '국·영문 초청장, 글로벌 SNS 홍보, 미국법인 홍보 메시지 (MODEX)'] },
      {
        label: '전시·현장 콘텐츠',
        items: [
          'AMR·Digital Twin 등 전시 콘텐츠, 현장 스케치 영상 (AW)',
          '3840×1920 전시 디스플레이 영상, 현장 스케치 및 사후 콘텐츠 (MODEX)',
          '공항물류 구축사례 정리, 국·영문 카드뉴스 (WAC)',
        ],
      },
      { label: '제작 지원', items: ['상부 LED 영상 제작 지원 (AW)'] },
      { label: '검수·보고', items: ['영업부서 검수를 거쳐 경영진 보고 (WAC)'] },
      { label: '분석', items: ['SNS 전후 성과 분석 (AW)'] },
    ],
    process: {
      flow: ['사전 홍보', '현장 콘텐츠', '사후 디지털 커뮤니케이션'],
      tags: [{ title: 'Featured events', items: ['AW 2026', 'MODEX 2026', 'WAC 2026'] }],
    },
    outcome: {
      done: ['WAC 2026 국·영문 카드뉴스: 경영진 보고 후 SNS 게시'],
      ...(exhibitionChanges ? { changes: exhibitionChanges } : { note: '전시 전후 채널 변화 수치는 공개 범위를 확인한 뒤 게시합니다.' }),
    },
  },

  // ── 05 · 극동MES ──────────────────────────────────────────
  {
    slug: 'brand-content-design',
    title: 'Brand Content & Design Production',
    category: 'Branding / Graphic Design / Creative Production',
    filter: 'Content',
    period: '2022–2025',
    organization: '극동MES',
    summary: '온라인 영상부터 광고, 상세페이지, 인쇄물, 이벤트까지 다양한 고객 접점을 위한 브랜드 콘텐츠를 제작했습니다.',
    cover: { kind: 'type', headline: ['Brand', '& Design'], caption: 'Ad, print, web, commerce', tone: 'signal' },
    placement: 'more',
    scope: [
      { label: '디자인', items: ['잡지 광고 디자인', '현수막·가격표 등 인쇄물 디자인', '웹디자인·아이콘 디자인'] },
      { label: '제작', items: ['카드뉴스 제작', '상품 상세페이지 제작', 'GIF·모션그래픽 등 디지털 콘텐츠'] },
      { label: '프로모션', items: ['온라인 프로모션 및 이벤트 콘텐츠', '오픈마켓 상품 운영 관련 콘텐츠'] },
      { label: '홍보', items: ['보도자료 및 언론홍보 콘텐츠'] },
    ],
    process: {
      groups: [
        { title: 'Digital', items: ['카드뉴스', 'GIF·모션그래픽', '웹디자인·아이콘'] },
        { title: 'Print & Ad', items: ['잡지 광고', '현수막', '가격표'] },
        { title: 'Commerce', items: ['상품 상세페이지', '온라인 프로모션·이벤트'] },
        { title: 'PR', items: ['보도자료', '언론홍보 콘텐츠'] },
      ],
    },
    outcome: {
      next: {
        text: ['이 시기의 개별 작업물은 Creative Archive에 분야별로 정리했습니다.'],
        link: { label: 'Creative Archive 보기', to: '/#archive' },
      },
    },
  },

  // ── 06 ────────────────────────────────────────────────────
  {
    slug: 'website-seo',
    title: 'Website & SEO Enhancement',
    category: 'Website / SEO / Digital Experience',
    filter: 'Web & Research',
    period: '2026',
    organization: 'HYUNDAI MOVEX',
    summary: '기업 홈페이지를 제품 정보 탐색과 검색 유입을 위한 디지털 접점으로 확장했습니다.',
    cover: { kind: 'type', headline: ['SEO', 'Blog'], caption: '2026.08.20 메뉴 오픈', tone: 'wash', motif: 'search' },
    header: 'split',
    placement: 'more',
    scope: [
      {
        label: '기획',
        items: [
          'SEO Blog 신설 및 콘텐츠 구조 설계',
          '구조화 데이터·태그·시리즈 체계 기획',
          '물류자동화 및 WMS/WCS 콘텐츠 기획',
          '3D Digital Mockup 페이지 기획',
        ],
      },
      { label: '검수', items: ['홈페이지 개편 및 콘텐츠 검수'] },
      { label: '협업', items: ['제품·솔루션별 3D 자료 협업'] },
      { label: '개선', items: ['국·영문 홈페이지 개선'] },
    ],
    featured: {
      milestone: { date: '2026.08.20', label: 'SEO 블로그 메뉴 오픈' },
    },
    process: {
      groups: [
        { title: 'Homepage', items: ['개편 및 콘텐츠 검수', '국·영문 개선'] },
        { title: 'SEO Blog', status: '오픈', items: ['콘텐츠 구조', '구조화 데이터·태그·시리즈 체계', '물류자동화 및 WMS/WCS 콘텐츠'] },
        { title: '3D Digital Mockup', status: '기획·개발 협업', items: ['페이지 기획', '제품·솔루션별 3D 자료'] },
      ],
    },
    outcome: {
      done: ['SEO 블로그 메뉴 오픈 (2026.08.20)'],
      ongoing: ['3D Digital Mockup 페이지: 기획·개발 협업 단계'],
    },
  },

  // ── 07 ────────────────────────────────────────────────────
  {
    slug: 'market-intelligence',
    title: 'Market Intelligence & Opportunity Discovery',
    category: 'Market Research / Strategic Intelligence',
    filter: 'Web & Research',
    period: '2025–2026',
    organization: 'HYUNDAI MOVEX',
    summary: '글로벌 산업정보를 분석해 시장 변화와 잠재 사업기회를 발굴하는 업무를 수행했습니다.',
    cover: { kind: 'type', headline: ['Market', 'Intelligence'], caption: '5 markets × 6 industries', tone: 'ink', motif: 'grid' },
    placement: 'more',
    scope: [
      { label: '조사', items: ['국내외 물류자동화 산업 뉴스 조사', '글로벌 공장 신설·증설·투자 동향'] },
      { label: '선별·분류', items: ['잠재 수주기회 관련 뉴스 선별', '지역별·산업별 기사 분류'] },
      { label: '분석', items: ['경쟁사 전략 및 기술 벤치마킹', '글로벌 SI 산업 리포트 검토'] },
      { label: '보고', items: ['주간 업계동향 보고'] },
    ],
    process: {
      flow: ['산업 뉴스 조사', '수주기회 관련 뉴스 선별', '지역별·산업별 분류', '주간 업계동향 보고'],
      tags: [
        { title: 'Markets', items: ['미국', '유럽', '동남아시아', 'UAE', '호주'] },
        { title: 'Industries', items: ['물류자동화', '배터리', '타이어', '콜드체인', '석유화학', '로보틱스'] },
      ],
    },
    outcome: {
      next: {
        text: ['이 업무 경험이 같은 과정을 AI로 구현한 개인 프로젝트 Global Opportunity Radar를 기획한 출발점이 됐습니다.'],
        link: { label: 'Global Opportunity Radar 보기', to: '/work/global-opportunity-radar/' },
      },
    },
  },

  // ── 08 ────────────────────────────────────────────────────
  {
    slug: 'lead-generation-framework',
    title: 'B2B Lead Generation Framework',
    category: 'Lead Generation / Email Marketing',
    filter: 'Growth',
    period: '2026',
    organization: 'HYUNDAI MOVEX',
    status: '기획 및 시안 제작',
    summary: '브랜드 인지도를 잠재 고객과의 지속적인 접점으로 연결하는 콘텐츠 기반 리드 확보 구조를 기획했습니다.',
    cover: { kind: 'type', headline: ['Newsletter', '→ CTA', '→ Website'], caption: 'Framework, 기획 및 시안 단계', tone: 'wash' },
    placement: 'more',
    scope: [
      {
        label: '기획',
        items: ['분기 뉴스레터 운영 체계 기획', '국·영문 콘텐츠 구조 설계', '전시 고객 DB 기반 타깃 구분', 'CTA 및 홈페이지 유입 구조 기획'],
      },
      { label: '시안 제작', items: ['산업 인사이트 및 제품 콘텐츠 구성', '4WS 뉴스레터 1호 시안'] },
      { label: '검토 반영', items: ['영업부서 검토 및 수정'] },
    ],
    process: {
      flow: ['전시 고객 DB', '타깃 구분', '분기 뉴스레터', 'CTA', '홈페이지 유입'],
    },
    outcome: {
      ongoing: ['기획 및 시안 제작 단계'],
    },
  },

  // ── 09 · AI Lab ───────────────────────────────────────────
  {
    slug: 'global-opportunity-radar',
    title: 'Global Opportunity Radar',
    category: 'AI Automation / Market Intelligence',
    filter: 'AI Lab',
    period: '2026',
    type: 'Personal AI Project',
    status: 'MVP 개발 및 기능 고도화',
    summary: '반복적인 시장조사 업무를 AI 기반 산업정보 수집·분류 및 잠재 수주기회 탐색 시스템으로 구현한 프로젝트.',
    cover: { kind: 'type', headline: ['Opportunity', 'Radar'], caption: 'AI market intelligence, MVP', tone: 'signal', motif: 'radar' },
    placement: 'lab',
    theme: 'dark',
    scope: [{ label: '기획·개발·테스트', items: ['Claude Code 등 AI 개발 도구를 활용해 직접 진행'] }],
    related: {
      text: '시장정보 분석 업무에서 반복하던 과정에서 출발했습니다.',
      link: { label: 'Market Intelligence 프로젝트 보기', to: '/work/market-intelligence/' },
    },
    process: {
      challenge: '수많은 글로벌 산업 뉴스에서 실제 사업과 관련성이 높은 정보를 찾고, 중복을 제거하고, 분석 보고서를 작성하는 일이 반복됐습니다.',
      flow: [
        '국내외 산업 뉴스 수집',
        '중복 기사 제거',
        '지역·산업·투자·경쟁사 카테고리 분류',
        'AI 기사 요약 및 관련성 검토',
        '잠재 수주기회 추천',
        '주간 업계동향 보고서 구성',
        'Excel 출력 연동',
      ],
    },
    outcome: {
      ongoing: ['MVP 개발 및 기능 고도화'],
    },
  },

  // ── 10 · AI Lab ───────────────────────────────────────────
  {
    slug: 'gona-game-universe',
    title: 'GONA Game Universe',
    category: 'Creative Coding / Game Design',
    filter: 'AI Lab',
    period: '2026',
    type: 'Personal Creative Project',
    summary: '캐릭터와 세계관을 직접 기획하고, AI 이미지·코딩 도구를 활용해 플레이 가능한 웹게임으로 구현한 개인 창작 프로젝트.',
    cover: {
      kind: 'image',
      src: 'media/gona-game-universe/cover.webp',
      alt: 'GONA’s Food Adventure 게임 리소스로 구성한 대표 이미지',
      ratio: '16 / 10',
    },
    placement: 'lab',
    theme: 'dark',
    scope: [
      { label: '기획', items: ['캐릭터와 세계관 기획'] },
      { label: '구현', items: ['AI 이미지·코딩 도구를 활용한 웹게임 구현'] },
    ],
    featured: {
      // 캡처는 2026-11-16 에 각 게임의 실제 화면을 모바일 크기로 찍은 것. 링크도 같은 날 접속 확인.
      items: [
        {
          title: 'GONA’s Food Adventure',
          status: '공개',
          link: { label: '게임 플레이', href: 'https://uipcjhj.github.io/GoNa/' },
          media: { kind: 'image', src: 'media/gona-game-universe/food.webp', alt: 'GONA’s Food Adventure 오프닝 화면', ratio: '1 / 2' },
        },
        {
          title: 'GONA Game Paradise',
          status: '공개',
          // 공개 이름은 "GONA GONE WILD! · 고나가 떴고나!"
          link: { label: 'GONA GONE WILD! 열기', href: 'https://uipcjhj.github.io/-GONA-s-Game-Paradise/' },
          media: { kind: 'image', src: 'media/gona-game-universe/paradise.webp', alt: 'GONA GONE WILD! 시작 화면', ratio: '1 / 2' },
        },
        {
          title: 'GONA’s Sky Adventure',
          status: '테스트 빌드',
          link: { label: '테스트 빌드 열기', href: 'https://uipcjhj.github.io/GoNa/sky-test/' },
          media: { kind: 'image', src: 'media/gona-game-universe/sky.webp', alt: 'GONA’s Sky Adventure 테스트 빌드 시작 화면', ratio: '1 / 2' },
        },
      ],
    },
    process: {
      groupStyle: 'events',
      groups: [
        {
          title: 'GONA’s Food Adventure',
          items: ['모바일 브라우저 기반 횡스크롤 러너', '간식 수집 및 성장 시스템', '4단계 캐릭터 성장', '보스전·특수 공격', '컷신·엔딩 스토리'],
        },
        {
          title: 'GONA Game Paradise',
          items: ['게임들을 연결하는 통합 플랫폼', '픽셀아트 월드맵', '미니게임천국', '업적, 코인, XP, 미션, 도감, 상점', '게임 기록 및 공유 랭킹 구조'],
        },
        {
          title: 'GONA’s Sky Adventure',
          items: ['세로형 아케이드 슈팅게임', '고나 및 가족 동료 캐릭터', '무기, 차지샷, 탄막, 보스전', '모바일 대응 인터페이스'],
        },
      ],
    },
    outcome: {
      done: ['GONA’s Food Adventure 공개', 'GONA Game Paradise 공개 (GONA GONE WILD!)'],
      ongoing: ['GONA’s Sky Adventure 테스트 빌드 개발'],
    },
  },
];

export const selectedWork = projects.filter((p) => p.placement === 'selected');
export const moreWork = projects.filter((p) => p.placement === 'more');
export const labProjects = projects.filter((p) => p.placement === 'lab');
export const findProject = (slug?: string) => projects.find((p) => p.slug === slug);
