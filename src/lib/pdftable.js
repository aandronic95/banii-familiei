// Extras bancar PDF → tabel (rânduri de celule), ca să treacă prin același import ca un CSV.
// items: textele din PDF cu poziția lor { str, x, y, w, page } (y crește în jos)
import { detectColumns, parseDate, parseSigned } from './csv.js'

// Rânduri vizuale: texte pe aceeași linie, lipite în celule când sunt apropiate
export function pdfLines(items, { yTol = 2.5, gap = 6 } = {}) {
  const sorted = items.filter((i) => String(i.str).trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= yTol) last.items.push(it)
    else lines.push({ page: it.page, y: it.y, items: [it] })
  }
  return lines.map((l) => {
    const cells = []
    for (const it of l.items.sort((a, b) => a.x - b.x)) {
      const c = cells[cells.length - 1]
      if (c && it.x - c.x1 < gap) { c.text += (it.x - c.x1 > 1 ? ' ' : '') + String(it.str).trim(); c.x1 = Math.max(c.x1, it.x + it.w) }
      else cells.push({ text: String(it.str).trim(), x0: it.x, x1: it.x + it.w })
    }
    return { page: l.page, y: l.y, cells }
  })
}

const AMOUNT = /^[-−+]?\(?\d{1,3}([ ., ]?\d{3})*([.,]\d{1,2})\)?(\s*(MDL|EUR|USD|lei))?$/i

export function pdfTable(items) {
  const lines = pdfLines(items)
  // 1) un antet recunoscut (Data / Suma / Descriere …): coloanele după poziția lui
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const texts = lines[i].cells.map((c) => c.text)
    const cols = detectColumns([texts])
    if (!cols) continue
    const head = lines[i].cells
    // granițele coloanelor: la mijlocul spațiului dintre titluri
    const bounds = head.map((c, k) => [k === 0 ? -Infinity : (head[k - 1].x1 + c.x0) / 2, k === head.length - 1 ? Infinity : (c.x1 + head[k + 1].x0) / 2])
    const colOf = (cell) => {
      let best = 0, bestOv = -Infinity
      bounds.forEach(([a, b], k) => { const ov = Math.min(b, cell.x1) - Math.max(a, cell.x0); if (ov > bestOv) { bestOv = ov; best = k } })
      return best
    }
    const rows = [texts]
    for (const l of lines.slice(i + 1)) {
      const row = texts.map(() => '')
      for (const c of l.cells) { const k = colOf(c); row[k] = row[k] ? row[k] + ' ' + c.text : c.text }
      if (row.join('') === texts.join('')) continue // antetul repetat pe pagina următoare
      const prev = rows[rows.length - 1]
      // descrierea continuă pe rândul de jos (fără dată și fără sumă)
      if (rows.length > 1 && !parseDate(row[cols.date]) && cols.desc >= 0 && row[cols.desc] && row.every((v, k) => k === cols.desc || !v)) {
        prev[cols.desc] = (prev[cols.desc] + ' ' + row[cols.desc]).trim(); continue
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
      out.push({ str: it.str, x, y: vp.height - y, w: it.width, page: p })
    }
  }
  return out
}
