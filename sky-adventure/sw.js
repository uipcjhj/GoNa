/* GONA's Sky Adventure Service Worker — 자동 생성 (tools/sky-pwa.py) · 버전 984de6db21 */
const VER = '984de6db21';
const SHELL = ["./", "index.html", "manifest.webmanifest", "assets/Galmuri11-Bold-QdFGsJ3v.woff2", "assets/Galmuri11-DfQIlyDK.woff2", "assets/gowun-batang-400-B4OGNs8r.woff2", "assets/gowun-batang-700-D4L7QKSj.woff2", "assets/index-BONqKooo.js", "assets/index-DSLgmNDD.css", "assets/sky/v3-poop/title/keyart-tall.jpg", "assets/sky/v3-poop/title/keyart.jpg", "assets/sky/v3-poop/title/logo-v10.png", "assets/sky/v3-poop/title/logo-v9.png", "assets/sky/v3-poop/title/logo.png", "assets/sky/v3-poop/title/sub-v10.png", "assets/sky/v3-poop/title/sub/C1.png", "assets/sky/v3-poop/title/sub/C3.png", "assets/sky/v3-poop/title/sub/C4.png", "assets/sky/v3-poop/title/sub/K1.png", "assets/sky/v3-poop/title/sub/K2.png", "assets/sky/v3-poop/title/sub/K3.png", "assets/sky/v3-poop/title/sub/K4.png", "assets/sky/v3-poop/title/sub/P1.png", "assets/sky/v3-poop/manifest.json", "pwa/icon-192.png"];
const CACHE = 'gona-sky-' + VER;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));   // 새 버전: 기다렸다가 화면의 '업데이트' 버튼으로 교체
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('gona-sky-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
  if (e.data === 'precache-core') {
    e.waitUntil(fetch('pwa/core.json').then((r) => r.json()).then(async (j) => {
      const c = await caches.open(CACHE);
      let done = 0;
      for (let i = 0; i < j.core.length; i += 8) {
        await Promise.all(j.core.slice(i, i + 8).map((u) => c.match(u).then((m) => m || c.add(u)).catch(() => null)));
        done = Math.min(j.core.length, i + 8);
        (await self.clients.matchAll()).forEach((cl) => cl.postMessage({ type: 'precache', done, total: j.core.length }));
      }
    }));
  }
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;            // 온라인 서버(Supabase) 요청은 건드리지 않음
  if (u.pathname.endsWith('/online-config.js')) {                                          // 온라인 설정: 항상 최신(인터넷 먼저)
    e.respondWith(fetch(e.request).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request)));
    return;
  }
  if (e.request.mode === 'navigate') {                                                  // 페이지: 인터넷 먼저 · 안 되면 캐시
    e.respondWith(fetch(e.request).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {   // 그림·소리·코드: 캐시 먼저 · 받은 건 캐시에
    if (res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); }
    return res;
  })));
});
