import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App';

export { getMeta, getTheme, staticPaths } from './lib/meta';
export { site } from './data/site';
export { projects } from './data/projects';
export { works } from './data/works';
export const base = import.meta.env.BASE_URL;

/** path: 베이스를 뺀 경로 (예: '/work/') */
export function render(path: string): string {
  const basename = base.replace(/\/$/, '');
  return renderToString(
    <StrictMode>
      <StaticRouter basename={base} location={basename + path}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
}
