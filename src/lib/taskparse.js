// Înțelege o sarcină sau o listă de cumpărături scrisă în cuvinte (în aplicație și în bot):
//   „sarcină: schimbă uleiul vineri la 18:00 pentru Andrian”
//   „plătește lumina 450 lei pe 15”        → sarcină cu bani
//   „udă florile în fiecare sâmbătă”        → se repetă săptămânal
//   „cumpără: lapte, pâine 2, ouă”          → listă de cumpărături
// Același cod e copiat pentru server în supabase/functions/_shared/taskparse.ts (testul verifică să fie identice).

const DAY = 86400000
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
const addDays = (d, k) => iso(Date.parse(d) + k * DAY)

export function addMonthsISO(d, k) {
  const [y, m, dd] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + k, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(dd, last))
  return iso(t.getTime())
}

// Următoarea dată a unei sarcini care se repetă (după ce a fost bifată)
export function nextDue(due, repeat, every = 1, today) {
  const n = Math.max(1, Number(every) || 1)
  let d = due || today
  const step = (x) => (repeat === 'daily' ? addDays(x, n) : repeat === 'weekly' ? addDays(x, 7 * n) : repeat === 'monthly' ? addMonthsISO(x, n) : null)
  if (!step(d)) return null
  d = step(d)
  // dacă a rămas în urmă (bifată târziu), sare la prima dată de azi încolo
  let guard = 0
  while (today && d < today && guard++ < 400) d = step(d)
  return d
}

const WEEKDAYS = [
  [/^(duminica|воскресенье|воскресенья)$/, 0], [/^(luni|понедельник|понедельника)$/, 1], [/^(marti|вторник|вторника)$/, 2],
  [/^(miercuri|среда|среду|среды)$/, 3], [/^(joi|четверг|четверга)$/, 4], [/^(vineri|пятница|пятницу|пятницы)$/, 5],
  [/^(sambata|суббота|субботу|субботы)$/, 6],
]
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie']
const MONTHS_RU = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр']

const TASK_PREFIX = /^\s*(sarcin[aă]|sarcini|task|todo|de f[aă]cut|задача|задачи|сделать)\s*[:\-–]\s*/i
const SHOP_PREFIX = /^\s*(cump[aă]r[aă]turi|cump[aă]r[aă]|lista|list[aă] de cump[aă]r[aă]turi|купить|покупки|список)\s*[:\-–]\s*/i
const PAY_RE = /(pl[aă]te[sș]te|pl[aă]ti|pl[aă]tit|plata|achit[aă]|transfer[aă]|d[aă] bani|оплат|заплат|перевест|отдать)/i

export function parseShopping(text) {
  return String(text || '').replace(SHOP_PREFIX, '').split(/[,;\n]+|\s+(?:și|si|и)\s+/i)
    .map((s) => s.trim()).filter(Boolean).slice(0, 50)
    .map((s) => {
      // „pâine 2”, „2 pâini”, „lapte 2l”, „ouă x10”
      const m = s.match(/^(.*?)\s+(?:x\s*)?(\d+(?:[.,]\d+)?\s*(?:buc|kg|g|l|ml|шт|кг|г|л)?\.?)$/i) || s.match(/^(\d+(?:[.,]\d+)?\s*(?:buc|kg|g|l|ml|шт|кг|г|л)?\.?)\s+(.*)$/i)
      if (m) {
        const [a, b] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]]
        return { name: cap(a).slice(0, 80), qty: b.replace(/\s+/g, '').slice(0, 20) }
      }
      return { name: cap(s).slice(0, 80), qty: null }
    })
    .filter((x) => x.name)
}

const cap = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t }

// members: [{ id, name }]; today: AAAA-LL-ZZ (ora Chișinăului)
/** @param {string} text @param {{ today?: string, members?: { id: string, name: string }[] }} [opts] */
export function parseTask(text, opts = {}) {
  const { today, members = [] } = opts
  let s = String(text || '').trim()
  if (!s) return null
  if (SHOP_PREFIX.test(s)) return { kind: 'shopping', items: parseShopping(s) }
  const explicit = TASK_PREFIX.test(s)
  s = s.replace(TASK_PREFIX, '')
  let due_date = null, due_time = null, repeat = 'none', assignee_id = null, amount = null
  // înlocuiește ce se potrivește cu un spațiu; dacă fn întoarce false, lasă textul cum era
  const cut = (re, fn) => { s = s.replace(re, (...m) => (fn(...m) === false ? m[0] : ' ')) }

  // Repetare
  cut(/(?:^|\s)(zilnic|[iî]n fiecare zi|in fiecare zi|ежедневно|каждый день)(?=\s|$|[.,!])/i, () => { repeat = 'daily' })
  cut(/(?:^|\s)(s[aă]pt[aă]m[aâ]nal|[iî]n fiecare s[aă]pt[aă]m[aâ]n[aă]|еженедельно|каждую неделю)(?=\s|$|[.,!])/i, () => { repeat = 'weekly' })
  cut(/(?:^|\s)(lunar|[iî]n fiecare lun[aă]|ежемесячно|каждый месяц)(?=\s|$|[.,!])/i, () => { repeat = 'monthly' })
  // „în fiecare vineri” → săptămânal, iar ziua rămâne în text ca să dea data
  s = s.replace(/(^|\s)(?:[iî]n fiecare|каждую|каждый|каждое)\s+([a-zăâîșțа-яё]+)/i, (all, pre, w) => {
    if (!WEEKDAYS.some(([re]) => re.test(norm(w)))) return all
    repeat = 'weekly'
    return pre + w
  })

  // Ora: „la 18:00”, „la 18”, „ora 9”, „в 18:30”, „18:30”
  cut(/(?:^|\s)(?:la|ora|в|к)\s+(\d{1,2})(?:[:.](\d{2}))?(?=\s|$)/i, (_, h, m) => { if (+h < 24) due_time = `${String(h).padStart(2, '0')}:${m || '00'}` })
  cut(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/, (_, h, m) => { if (+h < 24 && +m < 60) due_time = `${String(h).padStart(2, '0')}:${m}` })

  // Data
  if (today) {
    cut(/(?:^|\s)(azi|ast[aă]zi|сегодня)(?=\s|$)/i, () => { due_date = today })
    cut(/(?:^|\s)(poim[aâ]ine|послезавтра)(?=\s|$)/i, () => { due_date = addDays(today, 2) })
    cut(/(?:^|\s)(m[aâ]ine|завтра)(?=\s|$)/i, () => { due_date = addDays(today, 1) })
    cut(/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$)/, (_, d, m, y) => {
      let yy = y ? (y.length === 2 ? 2000 + +y : +y) : +today.slice(0, 4)
      let c = `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!y && c < today) c = `${yy + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!isNaN(Date.parse(c))) due_date = c
    })
    cut(/(?:^|\s)(?:pe|до|на)?\s*(\d{1,2})\s+([a-zăâîșțа-я]{3,})(?=\s|$)/i, (all, d, w) => {
      const n = norm(w)
      let mi = MONTHS.findIndex((x) => n.startsWith(x.slice(0, 3)))
      if (mi < 0) mi = MONTHS_RU.findIndex((x) => n.startsWith(x))
      if (mi < 0) return false
      let yy = +today.slice(0, 4)
      let c = `${yy}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (c < today) c = `${yy + 1}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      due_date = c
    })
    cut(/(?:^|\s)(?:pe|до|на)\s+(\d{1,2})(?=\s|$)/i, (_, d) => {
      const [y, m] = today.split('-').map(Number)
      let c = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (c < today) c = addMonthsISO(`${y}-${String(m).padStart(2, '0')}-01`, 1).slice(0, 8) + String(d).padStart(2, '0')
      if (!isNaN(Date.parse(c))) due_date = c
    })
    // Ziua săptămânii: „vineri”, „în vineri”, „pe luni”, „в пятницу” (azi, dacă e chiar ziua de azi)
    cut(/(?:^|\s)(?:(?:[iî]n|pe|в|во)\s+)?([a-zăâîșțа-яё]+)(?=\s|$)/gi, (all, w) => {
      const wd = WEEKDAYS.find(([re]) => re.test(norm(w)))
      if (!wd) return false
      const cur = new Date(today).getUTCDay()
      due_date = addDays(today, (wd[1] - cur + 7) % 7)
    })
  }

  // Persoana: „pentru Ana”, „@Ana”, „для Анны”
  // numele, tolerant la terminații („Ana” / „Anei”, „Ана” / „Аны”)
  const pick = (w) => {
    const n = norm(w).replace(/[^a-zа-яё]/g, '')
    if (n.length < 2) return null
    const close = (p) => {
      let k = 0
      while (k < n.length && k < p.length && n[k] === p[k]) k++
      return k >= Math.max(2, Math.min(n.length, p.length) - 1)
    }
    return members.find((m) => norm(m.name).replace(/[^a-zа-яё ]/g, '').split(' ').some((p) => p.length >= 2 && close(p))) || null
  }
  cut(/(?:^|\s)(?:pentru|для|@)\s*([A-Za-zĂÂÎȘȚăâîșțА-Яа-яЁё]+)/i, (all, w) => { const m = pick(w); if (!m) return false; assignee_id = m.id })

  // Suma (sarcină cu bani): „450 lei”, „~800”, „20€”, sau orice număr când e o plată
  const pay = PAY_RE.test(s)
  cut(/(?:^|\s)~?\s*(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(lei|mdl|leu|лей|лея|леев|€|eur|euro|евро|\$|usd)(?=\s|$|[.,!])/i, (_, a, b) => { amount = Number(a.replace(/\s/g, '') + '.' + (b || '0')) })
  if (amount === null) cut(/(?:^|\s)~\s*(\d+(?:[.,]\d{1,2})?)(?=\s|$)/, (_, a) => { amount = Number(a.replace(',', '.')) })
  if (amount === null && pay) cut(/(?:^|\s)(\d{2,7}(?:[.,]\d{1,2})?)(?=\s|$)/, (_, a) => { amount = Number(a.replace(',', '.')) })

  const title = cap(s.replace(/\s+([,.!?])/g, '$1').replace(/^[\s,.:;–-]+|[\s,.:;–-]+$/g, ''))
  if (!title) return null
  return { kind: 'task', explicit, title: title.slice(0, 120), due_date, due_time, repeat, assignee_id, amount, money: amount !== null || pay }
}
