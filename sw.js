/* Service worker do app IOBB (22/10/2026). Só intercepta NAVEGAÇÃO (abrir página)
   para mostrar um aviso quando não houver internet. Não guarda em cache nenhuma
   resposta de /api nem página com dado de paciente — tudo vem sempre do servidor. */
const CACHE = "iobb-app-v1";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/app-offline"]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;   // API, imagens, scripts: direto ao servidor
  e.respondWith(fetch(e.request).catch(() => caches.match("/app-offline")));
});
