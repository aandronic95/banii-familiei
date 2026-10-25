// Codul QR de pe bonul fiscal din Moldova (sistemul MEV al SFS).
// De obicei e un link de forma https://mev.sfs.md/receipt-verifier/<nr. aparat>/<suma>/<nr. bon>/<data>.
// Citim tolerant: orice ordine a bucăților, data în format AAAA-LL-ZZ sau ZZ.LL.AAAA, suma cu punct sau virgulă.
export function parseFiscalQr(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  let url = null, parts = []
  try {
    const u = new URL(raw)
    url = u.href
    parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    for (const [, v] of u.searchParams) parts.push(v)
    const i = parts.findIndex((p) => /receipt-?verifier/i.test(p))
    if (i >= 0) {
      parts = parts.slice(i + 1)
      // forma obișnuită: aparat / sumă / nr. bon / dată
      const [c, a, n, d] = parts
      if (parts.length >= 4 && /^\d+([.,]\d{1,2})?$/.test(a) && /^\d+$/.test(n)) parts = [d, a.includes('.') || a.includes(',') ? a : a + '.00', c, n]
    }
  } catch (_) {
    parts = raw.split(/[\s;|/]+/).filter(Boolean)
  }
  let date = null, amount = null, code = null, number = null
  for (const p of parts) {
    let m
    if (!date && (m = p.match(/^(\d{4})-(\d{2})-(\d{2})/))) { date = `${m[1]}-${m[2]}-${m[3]}`; continue }
    if (!date && (m = p.match(/^(\d{2})\.(\d{2})\.(\d{4})/))) { date = `${m[3]}-${m[2]}-${m[1]}`; continue }
    if (amount === null && /^\d+[.,]\d{1,2}$/.test(p)) { amount = Number(p.replace(',', '.')); continue }
    if (!code && /[a-z]/i.test(p) && /\d/.test(p) && p.length >= 5 && p.length <= 30) { code = p.toUpperCase(); continue }
    if (number === null && /^\d{1,10}$/.test(p)) { number = p; continue }
  }
  // Sumă fără zecimale (ex. „150”) când nu am găsit alta
  if (amount === null) {
    const n = parts.filter((p) => /^\d{1,7}$/.test(p) && p !== number)
    if (n.length) amount = Number(n[0])
  }
  // Forma nouă: doar un identificator (ex. …/receipt-verifier/F5EBCB96BE4D58BA606648B079C6DAFE).
  // Suma și produsele sunt pe pagină; le citim din textul copiat de acolo.
  const isMev = url && /sfs\.md/i.test(url)
  const token = isMev && parts.length === 1 && /^[0-9a-f]{16,64}$/i.test(parts[0]) ? parts[0].toUpperCase() : null
  if (token) return { amount: null, date: null, code: null, number: null, ref: 'MEV:' + token, url, needsPage: true }
  if (!(amount > 0) && !date) return isMev ? { amount: null, date: null, code: null, number: null, ref: null, url, needsPage: true } : null
  if (date && (date < '2015-01-01' || date > '2100-01-01')) date = null
  const ref = code ? [code, number, date].filter(Boolean).join('/') : null
  return { amount: amount > 0 ? Math.round(amount * 100) / 100 : null, date, code, number, ref, url: url && /sfs\.md/i.test(url) ? url : null }
}
