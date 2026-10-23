// Copia locală a datelor (IndexedDB): aplicația se deschide imediat și merge fără internet.
// Cheia include ID-ul Telegram, ca un alt cont pe același telefon să nu vadă datele.
const DB = 'banii-familiei', STORE = 'kv'
let dbp = null

function open() {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    try {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    } catch (e) { reject(e) }
  })
  return dbp
}

async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
  })
}

export const cacheGet = (key) => tx('readonly', (s) => s.get(key)).catch(() => null)
export const cacheSet = (key, value) => tx('readwrite', (s) => s.put(JSON.parse(JSON.stringify(value)), key)).catch(() => {})
export const cacheDel = (key) => tx('readwrite', (s) => s.delete(key)).catch(() => {})
