// 관리자 화면(/admin/)을 public/admin/ 에 만든다 (dev·build 전에 실행. 생성물은 저장소에 올리지 않는다).
//   /admin/      현황판: 콘텐츠 수, 최근 수정, 쓰이지 않는 파일
//   /admin/cms/  편집기: Sveltia CMS (Decap CMS 호환, MIT). 설정은 이 파일의 config 가 전부다.
//
// 저장 위치는 환경변수로 정한다.
//   CMS_REPO=owner/repo [CMS_BRANCH=main]  → GitHub 저장소에 커밋 (로그인 필요)
//   없으면                                  → 연습용 저장소(test-repo): 브라우저 안에서만 저장되고 실제로는 아무것도 바뀌지 않는다
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/admin');
const sh = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
// 저장소 안에서 이 프로젝트가 있는 위치 ('portfolio/' 또는 저장소 루트면 '')
const prefix = sh('git rev-parse --show-prefix');
const repo = process.env.CMS_REPO;
const read = (dir) => readdirSync(join(root, 'content', dir)).filter((f) => f.endsWith('.json')).map((f) => ({ file: `content/${dir}/${f}`, name: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(root, 'content', dir, f), 'utf8')) }));
const projects = read('projects').sort((a, b) => a.order - b.order);
const works = read('works').sort((a, b) => a.order - b.order);
const site = JSON.parse(readFileSync(join(root, 'content/settings/site.json'), 'utf8'));

// ───────────────────────── 편집기 설정 ─────────────────────────
const str = (name, label, extra = {}) => ({ name, label, widget: 'string', required: false, ...extra });
const text = (name, label, extra = {}) => ({ name, label, widget: 'text', required: false, ...extra });
const select = (name, label, options, extra = {}) => ({ name, label, widget: 'select', options, required: false, ...extra });
const strings = (name, label, extra = {}) => ({ name, label, widget: 'list', required: false, field: { name: 'item', label: '항목', widget: 'string' }, ...extra });
const object = (name, label, fields, extra = {}) => ({ name, label, widget: 'object', required: false, collapsed: true, fields, ...extra });
const list = (name, label, fields, extra = {}) => ({ name, label, widget: 'list', required: false, collapsed: true, fields, ...extra });
const image = (name, label, extra = {}) => ({ name, label, widget: 'image', required: false, ...extra });
const file = (name, label, extra = {}) => ({ name, label, widget: 'file', required: false, ...extra });
const type = (name, label, fields) => ({ name, label, widget: 'object', fields });
const link = (name, label) => object(name, label, [str('label', '버튼 글자'), str('href', '외부 주소 (https://…)'), str('to', '사이트 안 경로 (예: /work/…/)')]);

// 자료 목록: 유형을 골라 추가하고, 끌어서 순서를 바꾼다. 맨 위 자료가 대표(썸네일)가 된다.
const media = (name, label, hint = '맨 위 자료가 대표 이미지가 됩니다. 끌어서 순서를 바꿀 수 있습니다.') => ({
  name, label, hint, widget: 'list', required: false, collapsed: true, typeKey: 'kind', summary: '{{alt}}',
  types: [
    type('image', '이미지', [image('src', '이미지'), str('alt', '설명 (대체 텍스트)'), str('caption', '이미지 아래 글')]),
    type('youtube', 'YouTube 영상', [str('src', 'YouTube 주소 또는 영상 ID', { hint: '주소를 붙여 넣으면 썸네일과 재생 링크가 자동으로 만들어집니다.' }), str('alt', '영상 제목'), str('caption', '영상 아래 글')]),
    type('video', '영상 파일 (짧은 MP4)', [file('src', 'MP4 파일', { hint: '큰 영상은 YouTube 에 올리고 주소를 등록하세요. 저장소에는 파일당 100MB 를 넘길 수 없습니다.' }), image('poster', '대표 이미지'), str('alt', '설명')]),
    type('pdf', 'PDF 문서', [file('src', 'PDF 파일'), image('poster', '표지 이미지'), str('alt', '문서 제목')]),
  ],
});
// 본문: 블록을 쌓아 쓴다
const body = {
  name: 'body', label: '본문', hint: '블록을 추가해 자유롭게 씁니다. 비워 두면 화면에 나오지 않습니다.', widget: 'list', required: false, typeKey: 'kind',
  types: [
    type('heading', '제목', [str('text', '제목'), select('level', '크기', [{ label: '큰 제목', value: 'h2' }, { label: '소제목', value: 'h3' }], { default: 'h2' })]),
    type('text', '글', [{ name: 'body', label: '글', widget: 'markdown', required: false, buttons: ['bold', 'link', 'bulleted-list', 'numbered-list', 'quote', 'heading-two', 'heading-three'], editor_components: [], modes: ['rich_text'] }]),
    type('image', '이미지', [image('src', '이미지'), str('alt', '설명 (대체 텍스트)'), str('caption', '캡션')]),
    type('gallery', '이미지 갤러리', [list('images', '이미지들', [image('src', '이미지'), str('alt', '설명'), str('caption', '캡션')], { collapsed: false })]),
    type('youtube', 'YouTube 영상', [str('src', 'YouTube 주소 또는 영상 ID'), str('alt', '영상 제목')]),
    type('pdf', 'PDF 문서', [file('src', 'PDF 파일'), str('alt', '문서 제목')]),
    type('quote', '인용문', [text('text', '인용문'), str('cite', '출처')]),
    type('divider', '구분선', [{ name: 'line', label: '구분선', widget: 'hidden', default: true }]),
  ],
};
const cover = object('cover', '대표 비주얼 (카드·첫 화면)', [
  select('kind', '종류', [{ label: '글자 커버', value: 'type' }, { label: '이미지', value: 'image' }], { default: 'type' }),
  strings('headline', '글자 커버: 큰 글자 (줄마다 한 항목)'),
  str('caption', '글자 커버: 작은 설명'),
  select('tone', '글자 커버: 색', [{ label: '검정', value: 'ink' }, { label: '연회색', value: 'wash' }, { label: '라임', value: 'signal' }]),
  select('motif', '글자 커버: 장식', ['frames', 'search', 'grid', 'radar', 'play']),
  object('backdrop', '글자 커버 위에 올릴 실제 이미지', [image('src', '이미지'), str('alt', '설명')], { hint: '불러오지 못하면 글자 커버가 보입니다.' }),
  image('src', '이미지 커버: 이미지'),
  str('alt', '이미지 커버: 설명'),
  str('ratio', '이미지 커버: 비율 (예: 16 / 10)'),
], { collapsed: true });
const published = { name: 'published', label: '공개', widget: 'boolean', default: true, hint: '끄면 사이트에 나오지 않습니다.' };
const order = { name: 'order', label: '노출 순서', widget: 'number', value_type: 'int', required: false, hint: '작을수록 앞에 나옵니다.' };

const config = {
  backend: repo ? { name: 'github', repo, branch: process.env.CMS_BRANCH || 'main', commit_messages: { create: 'Content: add {{collection}} “{{slug}}”', update: 'Content: update {{collection}} “{{slug}}”', delete: 'Content: delete {{collection}} “{{slug}}”', uploadMedia: 'Content: upload {{path}}', deleteMedia: 'Content: delete {{path}}' } } : { name: 'test-repo' },
  app_title: `${site.name} Studio`,
  ...(site.url ? { site_url: site.url } : {}),
  media_folder: `${prefix}public/media/uploads`,
  public_folder: '/media/uploads',
  // 올린 사진은 웹용(WebP, 긴 변 2400px 이하)으로 바꿔 저장한다
  // 스톡 사진 검색은 끈다 (실제 작업물만 올린다)
  media_libraries: { stock_assets: { providers: [] }, default: { config: { max_file_size: 50 * 1024 * 1024, transformations: { raster_image: { format: 'webp', quality: 85, width: 2400, height: 2400 } } } } },
  output: { omit_empty_optional_fields: true },
  collections: [
    {
      name: 'works', label: 'Creative Archive', label_singular: '작업물', description: '직접 만든 작업물. 한 건이 갤러리의 카드 하나입니다.',
      folder: `${prefix}content/works`, format: 'json', extension: 'json', create: true, delete: true, slug: 'work-{{year}}{{month}}{{day}}-{{hour}}{{minute}}{{second}}', identifier_field: 'title',
      summary: '{{title}} — {{category}}', sortable_fields: ['order', 'title', 'category', 'year'], view_groups: [{ label: '유형', field: 'category' }, { label: '소속', field: 'organization' }], view_filters: [{ label: '홈 미리보기', field: 'featured', pattern: true }, { label: '숨김', field: 'publicationStatus', pattern: 'hidden' }],
      fields: [
        str('title', '작품 제목', { required: true }),
        select('category', '카테고리', ['Video', 'Design', 'Web', 'Competition', 'Editorial'], { required: true, default: 'Design' }),
        str('organization', '소속 (회사 이름 또는 개인 프로젝트)'), str('year', '제작 연도'), str('role', '담당 역할', { hint: '직접 한 일만 적습니다.' }),
        text('description', '작품 소개'), text('intent', '기획 의도'), text('process', '제작 과정'), text('result', '결과 및 성과', { hint: '확인된 것만 적습니다. 회사 비공개 수치는 적지 않습니다.' }),
        str('award', '수상 정보 (증빙이 확인된 것만)'), strings('tags', '태그'),
        media('media', '이미지·영상'),
        link('externalUrl', '관련 외부 링크'),
        list('documents', '문서 목록 (기사 제목 등)', [str('label', '구분'), str('title', '제목')]),
        body,
        select('publicationStatus', '공개 여부', [{ label: '공개', value: 'public' }, { label: '제목만 공개 (원본은 올리지 않음)', value: 'title-only' }, { label: '숨김', value: 'hidden' }], { default: 'public', required: true }),
        { name: 'featured', label: '홈 미리보기에 노출', widget: 'boolean', default: false }, order,
        str('source', '근거 (어디서 확인했는지)'), select('verificationStatus', '확인 상태', [{ label: '실물 확인', value: 'verified' }, { label: '목록에만 있음', value: 'listed' }], { default: 'verified' }),
      ],
    },
    {
      name: 'projects', label: 'Projects', label_singular: '프로젝트', description: '대표 프로젝트. 파일 이름이 주소(/work/이름/)가 됩니다.',
      folder: `${prefix}content/projects`, format: 'json', extension: 'json', create: true, delete: true, slug: '{{fields.address}}', identifier_field: 'title',
      summary: '{{order}}. {{title}} — {{organization}}', sortable_fields: ['order', 'title'], view_groups: [{ label: '홈 위치', field: 'placement' }], ...(site.url ? { preview_path: 'work/{{slug}}/' } : {}),
      fields: [
        str('title', '제목', { required: true }),
        // 새 프로젝트의 파일 이름(= 주소)을 정한다. 한글 제목만으로는 파일 이름을 만들 수 없어 따로 받는다.
        str('address', '주소 이름 (영문 소문자·숫자·하이픈)', { required: true, pattern: ['^[a-z0-9]+(-[a-z0-9]+)*$', '영문 소문자, 숫자, 하이픈만 쓸 수 있습니다 (예: brand-film-2026).'], hint: '사이트 주소 /work/주소-이름/ 이 됩니다. 처음 만들 때 정하고 나중에 바꾸지 않습니다.' }),
        text('summary', '한 줄 설명', { required: true }),
        str('category', '카테고리 문구'), select('filter', 'Work 목록 필터', ['Growth', 'Content', 'Web & Research', 'AI Lab'], { required: true, default: 'Content' }),
        str('period', '기간'), str('organization', '소속'), str('type', '유형 (개인 프로젝트일 때)'), str('status', '상태'),
        select('placement', '홈에서의 위치', [{ label: 'Selected Work', value: 'selected' }, { label: 'More Work', value: 'more' }, { label: 'AI Lab', value: 'lab' }], { required: true, default: 'more' }),
        order, published, cover,
        select('header', '상세 첫 화면 배치', [{ label: '넓게', value: 'wide' }, { label: '글과 커버 좌우', value: 'split' }]), select('theme', '테마', [{ label: '다크', value: 'dark' }]),
        list('scope', '역할 (성격별)', [str('label', '구분 (기획·제작·검수·운영 등)'), strings('items', '한 일')], { hint: '직접 한 일과 협업·지원한 일을 섞지 않습니다.' }),
        object('related', '관련 프로젝트 안내', [str('text', '안내 문장'), link('link', '링크')]),
        object('featured', '대표 결과물', [media('media', '영상·이미지'), text('note', '자료 안내문 (출처·담당 범위)'), object('milestone', '날짜가 있는 결과', [str('date', '날짜'), str('label', '내용')]), list('items', '결과물 카드', [str('title', '제목'), str('status', '상태'), link('link', '링크'), object('media', '이미지', [select('kind', '종류', ['image'], { default: 'image' }), image('src', '이미지'), str('alt', '설명'), str('ratio', '비율')])])]),
        object('process', '과정', [text('challenge', '과제'), object('shift', '바뀌기 전 → 후', [str('from', '전'), str('to', '후')]), strings('approach', '접근 방법'), strings('flow', '순서가 있는 흐름'), select('groupStyle', '묶음 모양', ['columns', 'events', 'gallery']), list('groups', '묶음', [str('title', '이름'), str('status', '상태'), strings('items', '항목'), media('media', '작업물 (갤러리 모양일 때)', '')]), list('tags', '태그 묶음', [str('title', '이름'), strings('items', '태그')]), text('note', '안내문'), media('media', '과정 자료', '')]),
        object('outcome', '결과', [strings('done', '완료'), strings('ongoing', '진행 중'), text('note', '안내문'), object('next', '다음으로 이어지는 글', [strings('text', '문단'), link('link', '링크')])], { hint: '끝난 일과 진행 중인 일을 나눠 적습니다. 회사 비공개 수치는 적지 않습니다.' }),
        body,
      ],
    },
    {
      name: 'settings', label: 'Settings', description: '소개, 경력, 역량, 연락처', format: 'json',
      files: [
        { name: 'site', label: '사이트 정보·연락처', file: `${prefix}content/settings/site.json`, fields: [str('name', '사이트 이름'), str('wordmark', '머리글 로고 글자'), str('role', '직무'), str('url', '배포 주소'), object('concept', '핵심 문구', [strings('en', '영문 (두 줄)'), str('ko', '한국어')], { collapsed: false }), text('intro', '서브 문구'), text('description', '검색 설명'), object('contact', '연락처 (비워 두면 숨김)', [str('email', '이메일'), str('linkedin', 'LinkedIn 주소'), str('github', 'GitHub 주소'), file('resume', '이력서 PDF')], { collapsed: false })] },
        { name: 'about', label: '자기소개', file: `${prefix}content/settings/about.json`, fields: [strings('paragraphs', '소개 문단', { field: { name: 'item', label: '문단', widget: 'text' } }), strings('path', '커리어 흐름'), list('highlights', 'Career Highlights', [str('en', '영문 제목'), str('ko', '설명'), str('to', '연결할 경로')])] },
        { name: 'career', label: '경력 타임라인', file: `${prefix}content/settings/career.json`, fields: [list('items', '경력 (최근 것이 위)', [str('period', '기간 (확인된 날짜만)'), str('organization', '회사·기관'), str('role', '직무'), strings('tasks', '주요 업무'), link('link', '대표 프로젝트 링크')], { collapsed: false, summary: '{{period}} {{organization}}' })] },
        { name: 'capabilities', label: '역량·사용 도구', file: `${prefix}content/settings/capabilities.json`, fields: [list('items', '업무 영역', [str('en', '영문 이름'), str('ko', '설명'), str('to', '연결할 경로')], { summary: '{{en}}' }), strings('tools', '사용 도구', { hint: '도구 이름만 적습니다 (숙련도 점수는 적지 않습니다).' })] },
        { name: 'process', label: 'How I Work', file: `${prefix}content/settings/process.json`, fields: [list('steps', '단계', [str('en', '영문'), str('ko', '제목'), text('text', '설명'), object('project', '근거 프로젝트', [str('label', '이름'), str('to', '경로')])], { summary: '{{en}}' })] },
      ],
    },
  ],
};

// ───────────────────────── 파일 쓰기 ─────────────────────────
mkdirSync(join(out, 'cms'), { recursive: true });
copyFileSync(join(root, 'node_modules/@sveltia/cms/dist/sveltia-cms.js'), join(out, 'cms/sveltia-cms.js'));
// 편집기가 필요할 때 불러오는 조각 파일 (소스맵 제외)
const chunks = join(root, 'node_modules/@sveltia/cms/dist/chunks');
cpSync(chunks, join(out, 'cms/chunks'), { recursive: true, filter: (f) => !f.endsWith('.map') });
writeFileSync(join(out, 'cms/config.json'), JSON.stringify(config, null, 2));
writeFileSync(join(out, 'cms/index.html'), `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex, nofollow" />
<title>${site.name} Studio</title><link href="config.json" type="application/json" rel="cms-config-url" /></head>
<body><script src="sveltia-cms.js"></script></body></html>
`);

// 현황판
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isPublic = (w) => w.publicationStatus !== 'hidden';
const when = (f) => sh(`git log -1 --format=%cs -- "${f}"`) || '저장 전';
const recent = [...projects.map((p) => ({ ...p, col: 'projects', shown: p.published !== false })), ...works.map((w) => ({ ...w, col: 'works', shown: isPublic(w) }))]
  .filter((e) => e.shown) // 비공개 항목의 제목은 공개 페이지인 현황판에 적지 않는다 (개수만 보여 준다)
  .map((e) => ({ ...e, date: when(e.file) })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
// 쓰이지 않는 파일: public/media 아래에 있는데 어떤 콘텐츠에도 적혀 있지 않은 것
const all = JSON.stringify([projects, works, site]);
const walk = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []);
const mediaFiles = walk(join(root, 'public/media')).map((f) => f.slice(join(root, 'public').length + 1).replaceAll('\\', '/')).filter((f) => !f.endsWith('README.md'));
const unused = mediaFiles.filter((f) => !all.includes(f) && !f.startsWith('media/archive/'));
const stat = (n, label) => `<li><b>${n}</b><span>${label}</span></li>`;
const hiddenCount = projects.filter((p) => p.published === false).length + works.filter((w) => !isPublic(w)).length;
writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex, nofollow" />
<title>${esc(site.name)} Studio</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#F7F7F2;color:#17191B;font:16px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:64rem;margin:0 auto;padding:2.5rem 1.25rem 5rem}h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1;letter-spacing:-.04em;margin:0}h2{font-size:1.125rem;margin:3rem 0 .75rem;padding-top:.75rem;border-top:1px solid #17191B}
p{margin:.5rem 0}.muted{color:#5f6667}a{color:inherit}.stats{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:.75rem;padding:0;margin:2rem 0 0}
.stats li{border:1px solid #d8d9d3;padding:1rem}.stats b{display:block;font-size:2.25rem;line-height:1;letter-spacing:-.04em}.stats span{font-size:.875rem;color:#5f6667}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.75rem}.btn{display:inline-block;padding:.8rem 1.1rem;font-weight:600;text-decoration:none;border:1px solid #17191B}.btn.main{background:#C8FF5F}.btn:hover,.btn:focus-visible{background:#17191B;color:#F7F7F2}
table{width:100%;border-collapse:collapse;font-size:.9375rem}td{padding:.6rem .5rem .6rem 0;border-bottom:1px solid #d8d9d3;vertical-align:top}td:last-child{text-align:right;white-space:nowrap;color:#5f6667}
.tag{font-size:.75rem;border:1px solid #17191B;padding:.05rem .4rem;margin-left:.4rem}.note{border-left:4px solid #C8FF5F;padding-left:.9rem;margin-top:1.5rem}code{font-size:.875em}
</style></head><body><main>
<p class="muted">${esc(site.name)}</p><h1>Studio</h1>
<p class="note">${repo ? `저장 위치: GitHub 저장소 <code>${esc(repo)}</code> (${esc(config.backend.branch)} 브랜치). 편집하려면 로그인해야 합니다.` : '지금은 <b>연습용 저장소</b>에 연결돼 있습니다. 편집기에서 저장해도 실제 사이트는 바뀌지 않습니다.'}</p>
<ul class="stats">${stat(projects.length, '프로젝트')}${stat(works.length, '작업물')}${stat(projects.length + works.length - hiddenCount, '공개 콘텐츠')}${stat(hiddenCount, '비공개 콘텐츠')}${stat(mediaFiles.length, '미디어 파일')}</ul>
<div class="actions"><a class="btn main" href="cms/#/collections/works/new">새 작업물 추가</a><a class="btn" href="cms/#/collections/works">Creative Archive</a><a class="btn" href="cms/#/collections/projects">Projects</a><a class="btn" href="cms/#/assets">Media Library</a><a class="btn" href="cms/#/collections/settings">Settings</a><a class="btn" href="../">사이트 보기</a></div>
<h2>최근 수정</h2><table>${recent.map((e) => `<tr><td><a href="cms/#/collections/${e.col}/entries/${encodeURIComponent(e.name)}">${esc(e.title)}</a>${e.shown ? '' : '<span class="tag">비공개</span>'}<br><span class="muted">${e.col === 'works' ? 'Creative Archive' : 'Projects'}</span></td><td>${e.date}</td></tr>`).join('')}</table>
<h2>쓰이지 않는 미디어 파일 (${unused.length})</h2>${unused.length ? `<table>${unused.map((f) => `<tr><td><code>${esc(f)}</code></td><td>미사용</td></tr>`).join('')}</table>` : '<p class="muted">없습니다.</p>'}
<p class="muted" style="margin-top:3rem">이 현황판은 사이트를 빌드할 때 만들어집니다. 편집기에서 저장한 내용은 다음 빌드 뒤에 반영됩니다.</p>
</main></body></html>
`);
console.log(`admin: ${repo ? `github ${repo}` : 'test-repo'} · ${projects.length} projects, ${works.length} works, ${unused.length} unused media`);
