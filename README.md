# HJ. PORTFOLIO

> Beyond Ideas. Into Reality. — 아이디어를 기획에서 끝내지 않고 실제 결과물로 구현하는 디지털마케터.

GONA 게임과 분리된 독립 프로젝트입니다. 이 폴더(`portfolio/`) 안에서만 설치·실행하며, 저장소 루트의 게임 코드와 배포 설정은 건드리지 않습니다.

## 실행

```bash
cd portfolio
npm install
npm run dev      # 개발 서버 (같은 Wi-Fi 의 아이폰에서 Network 주소로 접속 가능)
npm run build    # dist/ 에 정적 사이트 생성 (경로별 HTML 미리 생성 포함)
npm run preview  # 빌드 결과 미리보기
```

## 사이트맵

| 주소 | 내용 |
| --- | --- |
| `/` | Hero → Career Highlights(3) → Selected Work(4) → More Work(4) → AI Lab(2, 다크 전환) → Creative Archive → About·Experience → Capabilities → How I Work → Contact |
| `/work/` | 전체 프로젝트 10개 + 카테고리 필터 (`?category=Growth` 처럼 주소에 남음) |
| `/work/<slug>/` | 상세: Hero → Key Information → Featured Results → Process → Outcome (내용이 있는 영역만) |
| 그 외 | 404 안내 |

## 내용 고치기 — `src/data/` 만 수정하면 됩니다

| 파일 | 내용 |
| --- | --- |
| `site.ts` | 이름, 직무, 핵심 메시지, 소개, 연락처(이메일·LinkedIn·GitHub·이력서) |
| `projects.ts` | 프로젝트 10개(현대무벡스 6, 극동MES 2, AI Lab 2). 배열 순서가 프로젝트 번호: 역할 범위(scope), 대표 결과물(featured), 과정(process), 결과(outcome) |
| `about.ts` | Career Highlights, About 문단, 경력 타임라인(career), Capabilities, How I Work |
| `archive.ts` | Creative Archive: 분야별 이전 작업물 목록. 이미지는 `public/media/archive/` 에 넣고 항목의 `media` 에 적으면 갤러리로 나온다 |
| `figures.ts` + `private/` | 회사 수치 (아래 설명) |

- **없는 것은 화면에 나오지 않습니다.** 연락처는 값이 비어 있으면 숨겨지고, 상세 페이지 영역은 내용이 있는 것만 보입니다.
- **역할 범위(scope)**: 기획·제작·검수·운영처럼 성격별로 나눠 적습니다. 직접 한 일과 협업·지원한 일을 섞지 않습니다.
- **결과(outcome)**: 끝난 것은 `done`, 진행 중이거나 기획 단계인 것은 `ongoing` 에 적습니다.
- **경력(career)**: 확인된 날짜만 적습니다. 현대무벡스는 입사일만 확정이라 종료·재직 여부를 적지 않았습니다.
- **수상작**: `archive.ts` 에는 제목만 있습니다. 등급·주최·연도는 증빙을 확인한 뒤 `context` 에 적습니다.
- **이메일·LinkedIn·이력서**: `site.ts` 의 `contact` 에 값을 넣으면 Contact 영역에 나타납니다.

### 회사 수치 — 저장소에 올리지 않습니다

현대무벡스 채널 KPI·전시 전후 변화율, 극동MES 채널 성장률은 코드에 없습니다. 수치는 `src/data/private/figures.local.ts` 에만 적으며,
이 파일은 `.gitignore` 에 있어 저장소에 올라가지 않습니다.

1. `src/data/private/figures.example.ts` 를 `figures.local.ts` 로 복사한다.
2. 실제 수치를 적고, 공개할 항목만 `publish: true` 로 바꾼다.
3. 빌드하면 `publish: true` 인 항목만 화면에 나온다.

파일이 없으면(지금 상태, GitHub 자동 빌드 포함) 수치는 화면에도 빌드 결과물에도 없습니다.
공개를 최종 결정해 저장소에서 관리하려면 그때 `.gitignore` 의 해당 줄을 지우고 커밋합니다.

### 이미지·영상·PDF 넣기

파일을 `public/media/<프로젝트 slug>/` 에 넣고 `projects.ts` 에 적습니다. `src` 가 비어 있는 자료와 빈 묶음은 화면에 나오지 않습니다.

```ts
// 메인 비주얼: 카드와 상세 첫 화면. 타이포그래피 커버를 대신한다.
cover: { kind: 'image', src: 'media/product-storytelling/main.webp', alt: '4WS 홍보영상 장면' },

featured: {
  // 대표 결과물: Featured Results 맨 위에 나온다
  media: [
    { kind: 'youtube', src: '유튜브영상ID', alt: '4WS 홍보영상', poster: 'media/product-storytelling/thumb.webp' },
    { kind: 'video', src: 'media/product-storytelling/shorts.mp4', alt: 'Shorts' },
    { kind: 'pdf', src: 'media/product-storytelling/brochure.pdf', alt: '제품 소개서' },
  ],
},
process: {
  // 작업 과정 자료: Process 아래에 나온다
  media: [{ kind: 'image', src: 'media/product-storytelling/storyboard.webp', alt: '스토리보드', caption: '스토리보드' }],
},
```

- 이미지는 누르면 크게 열립니다. YouTube 는 누르기 전까지 외부 요청을 보내지 않습니다. PDF 는 새 창으로 열립니다.
- **빌드할 때 미디어를 검사합니다.** 파일이 없거나, 다른 프로젝트 폴더의 자료를 쓰거나, 어디에도 쓰이지 않는 파일이 있으면 빌드가 멈춥니다.
- 회사 자료는 외부 공개 가능 여부를 확인한 뒤 올립니다.

## 디자인 토큰 — `src/styles/index.css`

| 역할 | 값 |
| --- | --- |
| 배경 / 기본 텍스트 | `#F7F7F2` / `#17191B` (AI Lab 에서 서로 뒤바뀜) |
| 포인트 | `#C8FF5F` — 글자색이 아니라 배경·하이라이트로만 사용 (밝은 배경에서 읽히지 않음) |
| 보조 텍스트 | `#737A7B` (다크 테마에서는 대비를 위해 `#9AA1A2`) |
| 영문 / 한글 / 메타 | Space Grotesk / Pretendard / IBM Plex Mono — 모두 npm 패키지로 직접 서빙 (외부 요청 없음) |

## 구조

```
src/
  data/        콘텐츠 (화면 코드와 분리)
  sections/    메인 페이지 영역: Hero, Capabilities(+How I Work), SelectedWork(+More Work), Lab, AboutPreview, Contact
  pages/       Home, WorkIndex, ProjectDetail, NotFound
  components/  Header, Footer, ProjectCard, Cover(메인 비주얼), Media(이미지·영상·PDF·YouTube), Gallery(자료 묶음·확대 보기),
               Blocks(상세 페이지 블록), Stats(KPI·변화율), Reveal, TextLink
  lib/         asset(하위 경로), meta(SEO), usePage(제목·스크롤), sections(스크롤 위치 감지)
scripts/prerender.mjs   빌드 후 미디어 검사 + 경로별 정적 HTML + 404.html 생성
```

## 배포와 저장소 분리

이 폴더는 독립 프로젝트입니다. 저장소 루트의 게임 코드와 서로 가져다 쓰는 파일이 없고, 자체 `package.json` 과 lockfile 을 갖고 있어
폴더째로 새 저장소의 루트가 될 수 있습니다.

지금 이 저장소(GoNa)의 GitHub Pages 는 GONA 게임이 쓰고 있어서(저장소당 사이트 하나) 여기서는 배포하지 않습니다.

**별도 저장소로 옮기는 순서**

1. GitHub 에서 새 저장소를 만든다. 이름이 `<계정>.github.io` 이면 주소가 `https://<계정>.github.io/`,
   그 외(예: `portfolio`)면 `https://<계정>.github.io/portfolio/` 가 된다.
2. 이 폴더의 내용만 새 저장소로 보낸다. 수치가 들어간 적 없는 브랜치에서 실행한다.

   ```bash
   git subtree split --prefix=portfolio -b portfolio-only
   ```

   ```bash
   git push <새 저장소 주소> portfolio-only:main
   ```

3. 새 저장소 Settings → Pages → Source 를 "GitHub Actions" 로 바꾼다.

`.github/workflows/pages.yml` 이 이 폴더 안에 들어 있어, 새 저장소에서는 `main` 에 푸시할 때마다 자동으로 빌드·배포됩니다.
(지금 위치에서는 GitHub 가 이 파일을 실행하지 않습니다.) 하위 경로(`BASE_PATH`)는 저장소 이름에서 자동으로 정해집니다.

직접 빌드할 때는 하위 경로를 지정합니다.

```bash
BASE_PATH=/저장소이름/ npm run build
```

`site.ts` 의 `url` 에 배포 주소를 적으면 canonical, `sitemap.xml`, `robots.txt` 가 함께 생성됩니다.
