/** public/ 기준 경로를 배포 하위 경로(BASE_URL)가 붙은 주소로 바꾼다. */
export function asset(path: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
