import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 하위 경로 대응: BASE_PATH 환경변수로 배포 경로를 지정한다.
//   예) BASE_PATH=/GoNa/portfolio/ npm run build
// 지정하지 않으면 루트('/') 기준으로 빌드된다.
const base = `/${process.env.BASE_PATH ?? ''}/`.replace(/\/+/g, '/');

/**
 * 비공개 콘텐츠를 빌드에서 뺀다.
 * content/projects 의 published: false, content/works 의 publicationStatus: "hidden" 인 파일은
 * 내용 없이(null) 불러와져, 화면은 물론 빌드된 스크립트에도 글자가 남지 않는다.
 */
function hidePrivateContent(): Plugin {
  return {
    name: 'hide-private-content',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replaceAll('\\', '/');
      if (!/\/content\/(projects|works)\/[^/]+\.json$/.test(file)) return null;
      try {
        const data = JSON.parse(code);
        if (data.published === false || data.publicationStatus === 'hidden') return { code: 'null', map: null };
      } catch {
        /* JSON 이 아니면 그대로 둔다 */
      }
      return null;
    },
  };
}

export default defineConfig({
  base,
  plugins: [hidePrivateContent(), react(), tailwindcss()],
});
