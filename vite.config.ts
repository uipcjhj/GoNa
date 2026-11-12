import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        → 일반 정적 사이트 빌드 (dist/)
// `npm run build:single` → 모든 리소스가 포함된 단일 HTML (dist-single/index.html)
// 개발 기능(테스트 메뉴·?test·디버그 패널 등) 포함 여부 — 빌드 때 글자 그대로 true/false 로 바뀌어 정식 빌드에서는 코드째 빠짐 (src/env.ts)
const devTools = (mode: string): boolean => mode === 'development' || process.env.VITE_CHANNEL === 'dev';

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __DEV_TOOLS__: JSON.stringify(devTools(mode)),
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
}));
