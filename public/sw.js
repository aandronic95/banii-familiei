// Ține fișierele aplicației pe telefon: pornire mai rapidă și merge și cu internet slab.
// Datele financiare NU trec pe aici (cererile către Supabase merg direct).
const CACHE = 'bf-app-v1'
const TG_JS = 'https://telegram.org/js/telegram-web-app.js'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const scope = new URL(self.registration.scope)

  // Pagina: întâi de pe internet (ca să vină versiunea nouă), iar dacă nu merge repede, din copie
  if (req.mode === 'navigate' && url.origin === scope.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE)
      try {
        const r = await Promise.race([fetch(req), timeout(3500)])
        if (r.ok) c.put(scope.href, r.clone())
        return r
      } catch (_) {
        return (await c.match(scope.href)) || (await c.match(req)) || Response.error()
      }
    })())
    return
  }

  // Fișierele cu nume unic (assets/…): din copie, altfel de pe internet
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname + 'assets/')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE)
      const hit = await c.match(req)
      if (hit) return hit
      const r = await fetch(req)
      if (r.ok) c.put(req, r.clone())
      return r
    })())
    return
  }

  // Scriptul Telegram și fonturile: copia imediat, actualizată în fundal
  if (req.url === TG_JS || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE)
      const hit = await c.match(req)
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r }).catch(() => null)
      return hit || (await net) || Response.error()
    })())
  }
})
