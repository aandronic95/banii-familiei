// Extras bancar PDF → tabel (rânduri de celule), ca să treacă prin același import ca un CSV.
// items: textele din PDF cu poziția lor { str, x, y, w, page } (y crește în jos)
import { detectColumns, parseDate, parseSigned } from './csv.js'

// Rânduri vizuale: texte pe aceeași linie, lipite în celule când sunt apropiate
export function pdfLines(items, { yTol = 2.5, gap = 6 } = {}) {
  const sorted = items.filter((i) => String(i.str).trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    // aceeași linie: diferență mică pe verticală (băncile pun uneori descrierea cu 1–2 puncte mai jos)
    const tol = Math.max(yTol, 0.45 * (it.h || last?.h || 0))
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tol) last.items.push(it)
    else lines.push({ page: it.page, y: it.y, h: it.h || 0, items: [it] })
  }
  return lines.map((l) => {
    const cells = []
    for (const it of l.items.sort((a, b) => a.x - b.x)) {
      const c = cells[cells.length - 1]
      // moneda scrisă separat după sumă („-52.35   MDL”) rămâne cu suma
      const cur = c && /^(MDL|EUR|USD|RON|lei)$/i.test(String(it.str).trim()) && /\d$/.test(c.text) && it.x - c.x1 < 60
      if (c && (it.x - c.x1 < gap || cur)) { c.text += (it.x - c.x1 > 1 ? ' ' : '') + String(it.str).trim(); c.x1 = Math.max(c.x1, it.x + it.w) }
      else cells.push({ text: String(it.str).trim(), x0: it.x, x1: it.x + it.w })
    }
    return { page: l.page, y: l.y, cells }
  })
}

// Coloanele unui antet pe mai multe rânduri. Titlurile care acoperă mai multe coloane de dedesubt
// („Suma în valuta contului” peste ieșiri / intrări / comision) sunt „părinți”: se lipesc la numele coloanelor.
// Restul titlurilor, așezate unul sub altul („Data” / „tranzacției”), formează câte o coloană.
const ov = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
function headerCols(head) {
  const cells = head.flatMap((l) => l.cells.map((c) => ({ ...c, y: l.y })))
  const isParent = (c) => {
    const below = cells.filter((d) => d !== c && d.y > c.y && ov(c, d) > 0)
    return below.some((a) => below.some((b) => a !== b && ov(a, b) <= 0))
  }
  const parents = cells.filter(isParent), leaves = cells.filter((c) => !parents.includes(c))
  const groups = []
  for (const c of leaves.sort((a, b) => a.x0 - b.x0)) {
    const g = groups.find((k) => k.cells.some((d) => ov(c, d) > 0))
    if (g) { g.cells.push(c); g.x0 = Math.min(g.x0, c.x0); g.x1 = Math.max(g.x1, c.x1) } else groups.push({ x0: c.x0, x1: c.x1, cells: [c] })
  }
  return groups.sort((a, b) => a.x0 - b.x0).map((g) => ({
    x0: g.x0, x1: g.x1,
    text: [...parents.filter((p) => ov(p, g) > 0), ...g.cells].sort((a, b) => a.y - b.y).map((c) => c.text).join(' '),
  }))
}
// Rândurile antetului, de la `i` în jos: fără date și sume, apropiate unul de altul
function headerBlock(lines, i) {
  const head = [lines[i]]
  for (let k = i + 1; k < Math.min(lines.length, i + 7); k++) {
    const l = lines[k], prev = head[head.length - 1]
    const h = Math.max(prev.h || 0, l.h || 0, 6)
    if (l.page !== prev.page || l.y - prev.y > 1.6 * h || l.cells.some((c) => parseDate(c.text) || AMOUNT.test(c.text.trim()))) break
    head.push(l)
  }
  return head
}

const AMOUNT = /^[-−+]?\(?\d{1,3}([ ., ]?\d{3})*([.,]\d{1,2})\)?(\s*(MDL|EUR|USD|RON|lei))?$/i

export function pdfTable(items) {
  const lines = pdfLines(items)
  // 1) un antet recunoscut (Data / Suma / Descriere …): coloanele după poziția lui.
  //    Antetul poate avea 2–3 rânduri, cu titluri comune deasupra (MAIB: „Suma în valuta contului” peste ieșiri / intrări / comision / sold)
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if (lines[i].cells.some((c) => parseDate(c.text))) continue
    const head = headerBlock(lines, i)
    const cols = headerCols(head)
    const texts = cols.map((c) => c.text)
    const dc = detectColumns([texts])
    if (!dc) continue
    // granițele coloanelor: la mijlocul spațiului dintre titluri
    const bounds = cols.map((c, k) => [k === 0 ? -Infinity : (cols[k - 1].x1 + c.x0) / 2, k === cols.length - 1 ? Infinity : (c.x1 + cols[k + 1].x0) / 2])
    const colOf = (cell) => {
      let best = 0, bestOv = -Infinity
      bounds.forEach(([a, b], k) => { const ov = Math.min(b, cell.x1) - Math.max(a, cell.x0); if (ov > bestOv) { bestOv = ov; best = k } })
      return best
    }
    const headTexts = new Set(head.flatMap((l) => l.cells.map((c) => c.text)))
    const rows = [texts]
    for (const l of lines.slice(i + head.length)) {
      if (l.cells.every((c) => headTexts.has(c.text))) continue // antetul repetat pe pagina următoare
      const row = texts.map(() => '')
      for (const c of l.cells) { const k = colOf(c); row[k] = row[k] ? row[k] + ' ' + c.text : c.text }
      const prev = rows[rows.length - 1]
      // descrierea continuă pe rândul de jos (fără dată și fără sumă)
      if (rows.length > 1 && !parseDate(row[dc.date]) && dc.desc >= 0 && row[dc.desc] && row.every((v, k) => k === dc.desc || !v)) {
        prev[dc.desc] = (prev[dc.desc] + ' ' + row[dc.desc]).trim(); continue
      }
      rows.push(row)
    }
    return { rows, mode: 'table' }
  }
  // 2) fără antet: rândurile care încep cu o dată și au o sumă
  const rows = [['Data', 'Descriere', 'Suma']]
  for (const l of lines) {
    const t = l.cells.map((c) => c.text)
    const date = parseDate(t[0])
    if (!date) continue
    const ai = t.map((x, k) => (k > 0 && AMOUNT.test(x.trim()) ? k : -1)).filter((k) => k > 0)
    if (!ai.length) continue
    // prima sumă după descriere e de obicei suma operației (ultima poate fi soldul)
    const k = ai.length > 1 ? ai[ai.length - 2] : ai[0]
    const raw = t[k].trim()
    const v = parseSigned(raw)
    if (!v) continue
    const desc = t.slice(1, ai[0]).filter((x) => !parseDate(x)).join(' ')
    rows.push([t[0], desc, /^[+]/.test(raw) || v < 0 ? raw : '-' + raw])
  }
  return { rows, mode: rows.length > 1 ? 'lines' : 'none' }
}

// Citește textul din PDF (pdf.js, încărcat doar la nevoie)
export async function pdfItems(buf) {
  const pdfjs = await import('pdfjs-dist/build/pdf.min.js')
  const lib = pdfjs.default?.getDocument ? pdfjs.default : pdfjs
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
  lib.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true }).promise
  const out = []
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    for (const it of tc.items) {
      if (!it.str) continue
      const [, , , , x, y] = it.transform
      out.push({ str: it.str, x, y: vp.height - y, w: it.width, h: Math.abs(it.transform[3]) || it.height || 0, page: p })
    }
  }
  return out
}
