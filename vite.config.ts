import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 하위 경로 대응: BASE_PATH 환경변수로 배포 경로를 지정한다.
//   예) BASE_PATH=/GoNa/portfolio/ npm run build
// 지정하지 않으면 루트('/') 기준으로 빌드된다.
const base = `/${process.env.BASE_PATH ?? ''}/`.replace(/\/+/g, '/');

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
});
