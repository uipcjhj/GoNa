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
| `/` | Hero → Selected Work(4) → AI Lab(다크 전환) → About → Contact |
| `/work/` | 전체 프로젝트 + 카테고리 필터 (`?category=Video` 처럼 주소에 남음) |
| `/work/<slug>/` | 상세: Overview → Challenge → Strategy → Execution → Impact → Reflection |
| 그 외 | 404 안내 |

## 내용 고치기 — `src/data/` 만 수정하면 됩니다

| 파일 | 내용 |
| --- | --- |
| `site.ts` | 이름, 콘셉트 문구, 자기소개, 이메일·LinkedIn·GitHub·이력서, 초안 띠(`draft`) |
| `projects.ts` | 프로젝트 목록과 상세 6단계 본문. 객체를 추가하면 목록·필터·상세 페이지가 자동 생성 |
| `about.ts` | 핵심 역량, 경력, 사용 도구 |

- `placeholder: true` 인 항목은 화면에 **임시** 표시가 붙습니다. 실제 내용으로 바꾼 뒤 지우세요.
- 이미지·영상: `public/media/` 에 파일을 넣고 데이터의 `src` 에 `media/파일명` 을 적습니다. `src` 가 비어 있으면 "임시 이미지" 자리표시가 나옵니다.
- 이력서: `public/resume.pdf` 를 넣고 `site.ts` 의 `resume.href` 에 `'resume.pdf'` 를 적으면 다운로드 버튼이 켜집니다.
- 성과(Impact)에는 확인된 수치만 적습니다.

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
  sections/    메인 페이지 영역: Hero, SelectedWork, Lab, About, Contact
  pages/       Home, WorkIndex, ProjectDetail, NotFound
  components/  Header, Footer, ProjectCard, Media, Reveal, DraftTag, DraftBanner
  lib/         asset(하위 경로), meta(SEO), usePage(제목·스크롤), sections(스크롤 위치 감지)
scripts/prerender.mjs   빌드 후 경로별 정적 HTML + 404.html 생성
```

## GitHub Pages 배포

하위 경로는 `BASE_PATH` 로 지정합니다. 모든 링크·이미지·글꼴 주소에 자동으로 붙습니다.

```bash
BASE_PATH=/저장소이름/ npm run build
```

이 저장소의 Pages 는 GONA 게임이 쓰고 있어서(저장소당 사이트 하나) 자동 배포는 아직 연결하지 않았습니다.
전용 저장소로 옮길 경우 아래 워크플로를 `.github/workflows/pages.yml` 로 두면 됩니다.

```yaml
name: Deploy portfolio
on:
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: BASE_PATH=/${{ github.event.repository.name }}/ npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - uses: actions/deploy-pages@v4
```

`site.ts` 의 `url` 에 배포 주소를 적으면 canonical, `sitemap.xml`, `robots.txt` 가 함께 생성됩니다.
