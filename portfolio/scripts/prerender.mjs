// 빌드 후 실행: 각 경로를 정적 HTML 로 만들어 둔다.
// → GitHub Pages 에서 /work/ 같은 주소로 바로 들어와도 열리고, 검색엔진이 내용을 읽을 수 있다.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { render, getMeta, staticPaths, site, base } = await import(pathToFileURL(join(root, 'dist-ssr/entry-server.js')));

const template = await readFile(join(dist, 'index.html'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const siteUrl = site.url.replace(/\/$/, '');

function page(path) {
  const meta = getMeta(path);
  const extra = siteUrl && path !== '/404' ? `<link rel="canonical" href="${siteUrl}${path}" />\n    <meta property="og:url" content="${siteUrl}${path}" />` : '';
  return template
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
