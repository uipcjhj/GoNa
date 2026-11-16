// 빌드 후 실행: 각 경로를 정적 HTML 로 만들어 둔다.
// → GitHub Pages 에서 /work/ 같은 주소로 바로 들어와도 열리고, 검색엔진이 내용을 읽을 수 있다.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { render, getMeta, getTheme, staticPaths, site, base, projects, archive } = await import(pathToFileURL(join(root, 'dist-ssr/entry-server.js')));

// ── 미디어 검사: 자료는 자기 프로젝트 폴더(public/media/<slug>/)의 것만 쓸 수 있다 ──
// 파일이 없거나, 다른 프로젝트의 자료를 가져다 쓰거나, 어디에도 쓰이지 않는 파일이 있으면 빌드를 멈춘다.
{
  const problems = [];
  const used = new Set();
  // 프로젝트 자료는 media/<slug>/, Creative Archive 자료는 media/archive/
  const owners = [
    ...projects.map((p) => ({
      slug: p.slug,
      list: [p.cover, ...(p.featured?.media ?? []), ...(p.featured?.items ?? []).map((i) => i.media), ...(p.process?.media ?? []), ...(p.process?.groups ?? []).flatMap((g) => g.media ?? [])],
    })),
    { slug: 'archive', list: archive.flatMap((c) => c.items.map((i) => i.media)) },
  ];
  for (const p of owners) {
    for (const m of p.list) {
      if (!m || m.kind === 'type') continue;
      for (const file of [m.kind === 'youtube' ? undefined : m.src, m.poster]) {
        if (!file || /^https?:/.test(file)) continue;
        used.add(file);
        if (!file.startsWith(`media/${p.slug}/`)) problems.push(`${p.slug}: "${file}" 는 이 프로젝트 폴더(media/${p.slug}/)의 자료가 아닙니다`);
        if (!existsSync(join(dist, file))) problems.push(`${p.slug}: "${file}" 파일이 없습니다`);
      }
    }
  }
  const mediaDir = join(dist, 'media');
  if (existsSync(mediaDir)) {
    for (const entry of await readdir(mediaDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || entry.name === 'README.md') continue;
      const file = join(entry.parentPath, entry.name).slice(dist.length + 1).replaceAll('\\', '/');
      if (!used.has(file)) problems.push(`"${file}" 는 어느 프로젝트에서도 쓰이지 않습니다`);
    }
  }
  if (problems.length) {
    console.error('미디어 검사 실패:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`media check ok (${used.size} files)`);
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
