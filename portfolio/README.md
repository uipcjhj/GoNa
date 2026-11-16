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
| `/admin/` | 관리자 현황판과 편집기 (검색엔진 색인 제외) |
| `/archive/` | Creative Archive 갤러리: 유형 필터(`?category=Video`), 작업물 상세 창(`?work=<id>`) |
| `/work/` | 전체 프로젝트 10개 + 카테고리 필터 (`?category=Growth` 처럼 주소에 남음) |
| `/work/<slug>/` | 상세: Hero → Key Information → Featured Results → Process → Outcome (내용이 있는 영역만) |
| 그 외 | 404 안내 |

## 내용 고치기 — 관리자 화면 또는 `content/` 의 JSON

모든 글과 목록은 `content/` 폴더의 JSON 파일에 있고, 사이트는 빌드할 때 이 파일을 읽습니다.

| 폴더 | 내용 |
| --- | --- |
| `content/projects/<주소 이름>.json` | 대표 프로젝트. `order` 순서로 나오고 `published: false` 면 빌드에서 빠집니다 |
| `content/works/<id>.json` | Creative Archive 작업물. `publicationStatus: "hidden"` 이면 빌드에서 빠집니다 |
| `content/settings/*.json` | 사이트 정보·연락처, 자기소개, 경력, 역량·도구, How I Work |
| `public/media/uploads/` | 관리자 화면에서 올린 파일 |

- **없는 것은 화면에 나오지 않습니다.** 비워 둔 항목, 빈 목록, 값이 없는 연락처는 자동으로 숨겨집니다.
- **YouTube** 는 주소를 그대로 붙여 넣으면 됩니다. 영상 ID 와 썸네일은 자동으로 만들어집니다.
- **역할**: 직접 한 일과 협업·지원한 일을 섞지 않습니다. **결과**: 끝난 것과 진행 중인 것을 나눠 적습니다.
- **경력**: 확인된 날짜만 적습니다. **수상 정보**: 증빙이 확인된 것만 적습니다.

### 관리자 화면 (`/admin/`)

`npm run dev` 또는 빌드 결과의 `/admin/` 에서 엽니다. 현황판(`/admin/`)과 편집기(`/admin/cms/`, [Sveltia CMS](https://sveltiacms.app/en/))로 이뤄져 있고, 설정은 `scripts/admin.mjs` 한 파일에 있습니다.

| 연결 방식 | 저장되는 곳 | 필요한 것 |
| --- | --- | --- |
| 연습용 (기본) | 브라우저 안. 실제 사이트는 바뀌지 않음 | 없음 |
| 내 컴퓨터의 저장소 | 컴퓨터에 받아 둔 저장소 폴더의 파일 | Chrome/Edge, `CMS_REPO` 설정, 저장 후 git push |
| GitHub 저장소 | 저장소에 바로 커밋 → GitHub Actions 가 다시 빌드·배포 | `CMS_REPO` 설정, 로그인용 액세스 토큰 |

- GitHub 에 연결하려면 빌드할 때 `CMS_REPO=계정/저장소 CMS_BRANCH=main` 을 줍니다. `.github/workflows/pages.yml` 은 이 값을 자동으로 넣습니다.
- 로그인은 GitHub **fine-grained personal access token** 을 편집기 로그인 화면에 붙여 넣는 방식입니다(이 저장소 하나에 Contents 읽기/쓰기 권한만). 토큰은 그 브라우저에만 저장되며 코드나 저장소에는 들어가지 않습니다. 인증 서버가 필요 없습니다.
- 토큰이 없는 사람은 `/admin/` 을 열어도 아무것도 저장할 수 없습니다.
- 주의: 저장소가 공개라면 "숨김" 콘텐츠도 저장소의 파일로는 보입니다. 숨김은 사이트 빌드에서만 빠집니다. 공개하면 안 되는 내용은 저장하지 않습니다.
- 편집기는 화면 번역과 아이콘 글꼴을 외부 CDN(unpkg, jsDelivr)에서 받습니다.
- 올린 사진은 WebP(긴 변 2400px 이하)로 바뀌어 저장됩니다. 큰 영상은 YouTube 에 올리고 주소를 등록합니다.
- 배포가 잘못되면 GitHub 의 커밋 기록에서 해당 커밋을 되돌리면(Revert) 이전 내용으로 다시 배포됩니다.

### 회사 수치 — 저장소에 올리지 않습니다

현대무벡스 채널 KPI·전시 전후 변화율, 극동MES 채널 성장률은 코드에 없습니다. 수치는 `src/data/private/figures.local.ts` 에만 적으며,
이 파일은 `.gitignore` 에 있어 저장소에 올라가지 않습니다.

1. `src/data/private/figures.example.ts` 를 `figures.local.ts` 로 복사한다.
2. 실제 수치를 적고, 공개할 항목만 `publish: true` 로 바꾼다.
3. 빌드하면 `publish: true` 인 항목만 화면에 나온다.

파일이 없으면(지금 상태, GitHub 자동 빌드 포함) 수치는 화면에도 빌드 결과물에도 없습니다.
공개를 최종 결정해 저장소에서 관리하려면 그때 `.gitignore` 의 해당 줄을 지우고 커밋합니다.

### 이미지·영상·PDF 넣기

관리자 화면의 "이미지·영상" 에서 유형을 골라 추가합니다(이미지, YouTube, 짧은 MP4, PDF). 맨 위 자료가 대표 이미지가 되고, 끌어서 순서를 바꿉니다.
직접 파일로 넣을 때는 `public/media/archive/<작업물 id>/` 폴더에 넣으면 그 작업물의 갤러리에 자동으로 붙습니다.
YouTube 썸네일은 저장소에 복사하지 않고 YouTube 에서 불러옵니다(불러오지 못하면 글자 카드·제목만 보입니다).

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
