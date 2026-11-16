// 빌드 후 실행: 각 경로를 정적 HTML 로 만들어 둔다.
// → GitHub Pages 에서 /work/ 같은 주소로 바로 들어와도 열리고, 검색엔진이 내용을 읽을 수 있다.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { render, getMeta, getTheme, staticPaths, site, base, projects, works } = await import(pathToFileURL(join(root, 'dist-ssr/entry-server.js')));

// ── 미디어 검사 ──
// 콘텐츠에 적힌 파일이 없으면 경고한다 (관리자 화면에서 올린 파일이 빠졌는지 알 수 있도록). 빌드는 멈추지 않는다.
{
  const used = new Set();
  const missing = [];
  const visit = (v, owner) => {
    if (Array.isArray(v)) v.forEach((x) => visit(x, owner));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => visit(x, owner));
    else if (typeof v === 'string' && /^\/?media\/.+\.[a-z0-9]+$/i.test(v)) {
      const file = v.replace(/^\//, '');
      used.add(file);
      if (!existsSync(join(dist, file))) missing.push(`${owner}: "${file}" 파일이 없습니다`);
    }
  };
  projects.forEach((p) => visit(p, p.slug));
  works.forEach((w) => visit(w, `archive/${w.id}`));
  if (missing.length) console.warn('미디어 경고:\n  ' + missing.join('\n  '));
  console.log(`media check ${missing.length ? 'has warnings' : 'ok'} (${used.size} files)`);
}

const template = await readFile(join(dist, 'index.html'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const siteUrl = site.url.replace(/\/$/, '');

function page(path) {
  const meta = getMeta(path);
  const extra = siteUrl && path !== '/404' ? `<link rel="canonical" href="${siteUrl}${path}" />\n    <meta property="og:url" content="${siteUrl}${path}" />` : '';
  const dark = getTheme(path) === 'dark';
  return template
    .replace('<html lang="ko">', dark ? '<html lang="ko" data-theme="dark">' : '<html lang="ko">')
    .replace('name="theme-color" content="#F7F7F2"', `name="theme-color" content="${dark ? '#17191B' : '#F7F7F2'}"`)
    .replace(/<title>.*?<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(meta.description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(meta.title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(meta.description)}`)
    .replace('<!--seo-extra-->', extra)
    .replace('<!--app-html-->', render(path));
}

for (const path of staticPaths) {
  const file = join(dist, path, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page(path));
}
// 없는 주소로 들어오면 GitHub Pages 가 404.html 을 보여 준다
await writeFile(join(dist, '404.html'), page('/404'));
await writeFile(join(dist, '.nojekyll'), '');

if (siteUrl) {
  const urls = staticPaths.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`).join('\n');
  await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
}

await rm(join(root, 'dist-ssr'), { recursive: true, force: true });
console.log(`prerendered ${staticPaths.length} pages + 404 (base: ${base})`);
