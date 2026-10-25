// Citește textul copiat de pe pagina bonului fiscal (mev.sfs.md) sau dintr-o poză:
// magazinul, data, totalul și TOATE pozițiile (denumire, cantitate, preț, sumă).
// Formatele de pe bonurile din Moldova diferă puțin între case de marcat, așa că citim tolerant:
//   „Lapte 2,5% 1L 2.000 x 18.90 = 37.80 A”
//   „Lapte 2,5% 1L” + pe rândul următor „2 x 18,90 37,80 A”
//   „Pâine albă 9.50 A” (cantitate 1)
import { extractReceipt } from './receipt.js'

const NUM = String.raw`\d{1,3}(?:[  ]\d{3})*(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?`
const toNum = (s) => Number(String(s).replace(/[  ]/g, '').replace(',', '.'))
const r2 = (x) => Math.round(x * 100) / 100

// cantitate × preț [=] sumă [literă TVA]
const QTY_RE = new RegExp(String.raw`(?:^|\s)(${NUM})\s*(?:buc\.?|kg|l|шт\.?|pcs)?\s*[x×*х]\s*(${NUM})(?:\s*=)?\s+(${NUM})(?:\s*[A-ZА-Я])?\s*$`, 'i')
// rând care se termină cu o sumă cu 2 zecimale (+ literă TVA)
const END_AMT_RE = /(\d{1,3}(?:[  ]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?:\s*[A-ZА-Я])?\s*$/

const STOP_RE = /^(total|suma\s*total|total\s*de\s*plat|spre\s*plat|de\s*achitat|итого|к\s*оплате|всего)/i
const NOISE_RE = /(tva|т\.?в\.?а|ндс|cota|cotă|rest\b|сдача|numerar|card\b|carte|plata|plată|achitat|primit|bon\s*fiscal|nr\.?\s*bon|cod\s*fiscal|idno|fiscal|nr\.?\s*înreg|inregistr|casier|кассир|operator|adresa|str\.|mun\.|or\.|tel\.|www\.|http|sfs|mev|discount\s*total|subtotal|^\d{2}[./-]\d{2}[./-]\d{2,4}|^\d{4}-\d{2}-\d{2})/i

function cleanName(s) {
  return String(s || '').replace(/^\s*\d+[.)]\s+/, '').replace(/\s{2,}/g, ' ').replace(/[\s:;,-]+$/, '').trim().slice(0, 80)
}

export function parseReceiptText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean)
  const base = extractReceipt(text) // total + magazin (aceeași logică ca la poze)

  // Data: ZZ.LL.AAAA sau AAAA-LL-ZZ
  let date = null
  for (const l of lines) {
    let m = l.match(/(\d{2})[./-](\d{2})[./-](\d{4})/)
    if (m) { date = `${m[3]}-${m[2]}-${m[1]}`; break }
    m = l.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m) { date = `${m[1]}-${m[2]}-${m[3]}`; break }
  }

  // Pozițiile: între antet și rândul cu TOTAL
  const stop = lines.findIndex((l) => STOP_RE.test(l))
  const body = stop >= 0 ? lines.slice(0, stop) : lines
  const items = []
  let pendingName = null
  for (const l of body) {
    const q = l.match(QTY_RE)
    if (q) {
      const before = cleanName(l.slice(0, q.index))
      const name = before && /[a-zа-яăâîșțşţ]{2,}/i.test(before) ? before : pendingName
      const qty = toNum(q[1]), price = toNum(q[2]), sum = toNum(q[3])
      if (name && sum > 0 && Math.abs(qty * price - sum) <= Math.max(0.05, sum * 0.02)) {
        items.push({ name, qty, price: r2(price), sum: r2(sum) })
        pendingName = null
        continue
      }
    }
    if (NOISE_RE.test(l)) { pendingName = null; continue }
    const e = l.match(END_AMT_RE)
    const letters = (l.match(/[a-zа-яăâîșțşţ]/gi) || []).length
    if (e && letters >= 3) {
      const name = cleanName(l.slice(0, e.index))
      const sum = toNum(e[1])
      if (name && sum > 0) { items.push({ name, qty: 1, price: r2(sum), sum: r2(sum) }); pendingName = null; continue }
    }
    // rând doar cu text: probabil denumirea produsului de pe rândul următor
    pendingName = letters >= 3 && !/\d[.,]\d{2}/.test(l) ? cleanName(l) : null
  }

  // Reduceri pe poziții („Reducere -5.00”) — scad din ultima poziție
  for (const l of body) {
    const m = l.match(/(reducere|discount|скидка)\s*[-−]?\s*(\d+[.,]\d{2})/i)
    if (m && items.length) { const last = items[items.length - 1]; last.sum = r2(last.sum - toNum(m[2])) }
  }

  const itemsSum = r2(items.reduce((s, x) => s + x.sum, 0))
  const total = base.total ?? (itemsSum || null)
  // Magazinul: primul rând cu litere care nu e zgomot (SRL / rețea)
  let merchant = base.merchant
  if (!merchant) merchant = lines.find((l) => /[a-zа-я]{3,}/i.test(l) && !NOISE_RE.test(l))?.slice(0, 40) || null
  return { merchant, date, total, items, itemsSum, matches: total != null && items.length > 0 && Math.abs(itemsSum - total) <= 0.05 }
}

// Notă scurtă pentru cheltuială: „Lapte ×2, Pâine, Ouă ×10 …”
export function itemsNote(items, max = 190) {
  const parts = items.map((x) => (x.qty && x.qty !== 1 ? `${x.name} ×${String(x.qty).replace('.', ',')}` : x.name))
  let out = ''
  for (const p of parts) {
    if ((out + (out ? ', ' : '') + p).length > max - 2) { out += ' …'; break }
    out += (out ? ', ' : '') + p
  }
  return out
}
