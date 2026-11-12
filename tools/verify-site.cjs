/**
 * 배포 직전 검사 (GitHub Actions 가 실행 · 하나라도 실패하면 배포하지 않음 → 지금 사이트가 그대로 유지됨)
 *   node tools/verify-site.cjs <site> <prod-src> <dev-src>
 *   site/      = 정식 (main 빌드)  ·  site/dev/ = 개발 (dev 빌드)
 *   ① 두 사이트 모두 각자 소스의 public/ 파일(영상·BGM·그림·아이콘·manifest)이 빠짐없이 있음
 *   ② 정식 사이트의 자바스크립트에 개발용 기능(테스트 메뉴 · ?test 경로 · 디버그 패널 · 테스트 빌드 표시)이 없음
 *   ③ 개발 사이트에는 개발용 기능이 있음 · 정식 빌드 결과물 안에 dev/ 폴더가 없음 (서로 덮어쓰지 않음)
 */
const fs = require('fs');
const path = require('path');
const [site, prodSrc, devSrc] = process.argv.slice(2);
let bad = 0;
const fail = (m) => {
  console.error('✗ ' + m);
  bad++;
};
const ok = (m) => console.log('✓ ' + m);
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))]));
const check = (name, out, src, skipDev) => {
  if (!fs.existsSync(path.join(out, 'index.html'))) return fail(`${name}: index.html 없음`);
  const pub = walk(path.join(src, 'public'));
  const missing = pub.filter((f) => !(skipDev && f.startsWith('dev/')) && !fs.existsSync(path.join(out, f)));
  if (missing.length) fail(`${name}: public 파일 ${missing.length}개 없음 — ${missing.slice(0, 8).join(', ')}`);
  else ok(`${name}: public 파일 ${pub.length}개 모두 있음`);
  for (const must of ['assets/ending/ending_01_running_hug.mp4', 'assets/ending/ending_02_grandma_kiss.mp4', 'assets/ending/ending_03_uncle_sniff.mp4', 'assets/ending/ending_04_family_portrait.mp4', 'assets/audio/bgm-ending.mp3', 'apple-touch-icon.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) {
    const f = path.join(out, must);
    if (!fs.existsSync(f) || fs.statSync(f).size < 100) fail(`${name}: ${must} 없음/비어 있음`);
  }
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  for (const tag of ['rel="apple-touch-icon"', 'rel="manifest"', 'rel="icon"']) if (!html.includes(tag)) fail(`${name}: index.html 에 ${tag} 없음`);
  const js = walk(path.join(out, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
  return js;
};
const prodJs = check('정식', site, prodSrc, true);
const devJs = check('개발', path.join(site, 'dev'), devSrc, false);
const devMarkers = ['기능 테스트 메뉴', '?test=', '몬스터 테스트', 'debugAudio', '테스트 빌드', 'gona-dev:'];
if (prodJs !== undefined) {
  const leak = devMarkers.filter((m) => prodJs.includes(m));
  if (leak.length) fail(`정식 빌드에 개발용 기능이 들어 있음: ${leak.join(', ')}`);
  else ok('정식 빌드: 개발용 기능 없음');
  if (fs.existsSync(path.join(prodSrc, 'dist', 'dev'))) fail('정식 빌드 결과에 dev/ 폴더가 있음 (개발 사이트와 겹침)');
}
if (devJs !== undefined) {
  if (!devJs.includes('기능 테스트 메뉴')) fail('개발 빌드에 테스트 메뉴가 없음');
  else ok('개발 빌드: 테스트 메뉴 있음');
}
if (bad) {
  console.error(`\n검사 실패 ${bad}건 — 배포하지 않음 (지금 사이트 유지)`);
  process.exit(1);
}
console.log('\n모든 검사 통과');
