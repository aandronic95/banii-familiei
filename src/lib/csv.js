// Citirea extraselor bancare CSV (Revolut, MAIB, MICB și altele), fără dependențe

export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '')
  // Separatorul: cel mai frecvent pe rândul cu cele mai multe separatoare din primele 15
  let sep = ',', best = 0
  for (const line of text.split(/\r?\n/).slice(0, 15)) {
    const counts = { ',': 0, ';': 0, '\t': 0 }
    let q = false
    for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++ }
    for (const [k, v] of Object.entries(counts)) if (v > best) { best = v; sep = k }
  }
  const rows = []
  let row = [], cell = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQ = false
      else cell += c
    } else if (c === '"') inQ = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()))
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()))
  return { sep, rows }
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Găsește rândul cu antetul (primele 15 rânduri) și coloanele importante
export function detectColumns(rows) {
  const has = (h, re) => re.test(norm(h))
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const h = rows[r]
    const find = (re, not) => h.findIndex((x) => has(x, re) && !(not && has(x, not)))
    const date = (() => {
      const c = find(/^(completed date|data tranzact|data operat|data inregistr|data valut)/)
      return c >= 0 ? c : find(/(^|\s)(date|data|дата)(\s|$)|started date|^data/)
    })()
    const amount = find(/^(amount|suma|sum|сумма|valoare|amount in)/, /fee|comision|balance|sold/)
    const debit = find(/(debit|iesiri|cheltuiel|расход|списан)/)
    const credit = find(/(credit|intrari|incasari|приход|зачисл)/, /card/)
    const desc = (() => {
      const c = find(/^(description|descriere|detalii|merchant|beneficiar|destinat|назначени|описани|explicat|comerciant|partener)/)
      return c >= 0 ? c : find(/(descr|detal|info)/)
    })()
    const fee = find(/^(fee|comision|комисс)/)
    const state = find(/^(state|stare|status|статус)/)
    const currency = find(/^(currency|valuta|moneda|валюта)$/)
    if (date >= 0 && (amount >= 0 || debit >= 0 || credit >= 0)) {
      return { headerRow: r, date, amount, debit, credit, desc, fee, state, currency }
    }
  }
  return null
}

// Sumă cu semn: "-1 234,56", "1.234,56", "(45.00)", "−12,30 MDL"
export function parseSigned(s) {
  let raw = String(s ?? '').trim()
  if (!raw) return null
  let neg = /^[-−–]/.test(raw) || /^\(.*\)$/.test(raw) || /[-−]\s*$/.test(raw)
  let num = raw.replace(/[^\d.,]/g, '')
  if (!num) return null
  const lastDot = num.lastIndexOf('.'), lastComma = num.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) num = lastComma > lastDot ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '')
  else if (lastComma >= 0) num = /,\d{3}$/.test(num) && (num.match(/,/g) || []).length > 1 ? num.replace(/,/g, '') : num.replace(',', '.')
  else if ((num.match(/\./g) || []).length > 1) num = num.replace(/\./g, '')
  const v = parseFloat(num)
  if (!isFinite(v)) return null
  return Math.round((neg ? -v : v) * 100) / 100
}

// "2026-10-12 16:05:33", "12.10.2026", "12/10/2026", "12-10-2026 16:05" → "2026-10-12"
export function parseDate(s) {
  const t = String(s || '').trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})(?!\d)/)
  if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// Transformă rândurile în tranzacții { date, kind, amount, description }
export function toTransactions(rows, cols) {
  const out = []
  for (let r = cols.headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (cols.state >= 0) {
      const st = norm(row[cols.state])
      if (st && /(revert|declin|fail|pending|anulat|respins|in asteptare)/.test(st)) continue
    }
    const date = parseDate(row[cols.date])
    if (!date) continue
    let value = null
    if (cols.amount >= 0) value = parseSigned(row[cols.amount])
    if ((value === null || value === 0) && (cols.debit >= 0 || cols.credit >= 0)) {
      const d = cols.debit >= 0 ? parseSigned(row[cols.debit]) : null
      const c = cols.credit >= 0 ? parseSigned(row[cols.credit]) : null
      if (d) value = -Math.abs(d)
      else if (c) value = Math.abs(c)
    }
    if (!value) continue
    const fee = cols.fee >= 0 ? Math.abs(parseSigned(row[cols.fee]) || 0) : 0
    if (value < 0) value -= fee
    const description = cols.desc >= 0 ? String(row[cols.desc] || '').replace(/\s+/g, ' ').trim().slice(0, 60) : ''
    out.push({ date, kind: value < 0 ? 'expense' : 'income', amount: Math.round(Math.abs(value) * 100) / 100, description, currency: cols.currency >= 0 ? row[cols.currency] : null })
  }
  return out
}
