import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// 빌드 결과물은 미리 만든 HTML 위에 이어 붙이고(hydrate), 개발 서버에서는 새로 그린다
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
