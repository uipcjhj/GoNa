// public/media/archive/<작업물 id>/ 폴더의 파일 목록을 src/data/archive-media.gen.ts 로 적는다.
// 파일을 폴더에 넣기만 하면 그 작업물의 갤러리가 자동으로 구성된다 (dev·build 전에 실행).
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public/media/archive');
const OK = /\.(webp|png|jpe?g|gif|avif|mp4|pdf)$/i;
const map = {};
if (existsSync(dir)) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const files = readdirSync(join(dir, entry.name)).filter((f) => OK.test(f)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    if (files.length) map[entry.name] = files.map((f) => `media/archive/${entry.name}/${f}`);
  }
}
writeFileSync(
  join(root, 'src/data/archive-media.gen.ts'),
  `// 자동 생성 파일 (scripts/archive-media.mjs). 직접 고치지 않는다.\nexport const archiveFiles: Record<string, string[]> = ${JSON.stringify(map, null, 2)};\n`,
);
console.log(`archive media: ${Object.keys(map).length} works with files`);
