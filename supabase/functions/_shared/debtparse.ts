// @ts-nocheck — copie identică a src/lib/debtparse.js (testul verifică)
// Bani dați sau primiți cu împrumut, scriși ca o cheltuială/venit obișnuit („datorie octavian 600”, „întors datorie danu”).
// Nu sunt cheltuieli: se trec la Datorii, ca să nu strice rapoartele.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const DEBT = /(^|\s)(datori\w*|imprumut\w*|in datorie|долг\w*|займ\w*|одолжил\w*|занял\w*|взаймы)(?=\s|$)/
const BACK = /(^|\s)(intors\w*|intoarce\w*|returnat\w*|inapoi|achitat\w*|rambursat\w*|вернул\w*|возврат\w*|отдал\w*)(?=\s|$)/
const FROM = /(^|\s)(de la|от|у)(\s|$)/
const FILLER = new Set(['de', 'la', 'lui', 'pentru', 'catre', 'spre', 'mi', 'a', 'am', 'i', 'ia', 'iam', 'dat', 'luat', 'primit', 'от', 'у', 'для', 'мне', 'я', 'дал', 'взял', 'получил', 'cu', 'pe', 'si'])

// kind: 'expense' | 'income'; text: descrierea. Întoarce { type, direction, person } sau null.
//  lend   = am dat cu împrumut (ne datorează)     — cheltuială
//  repay  = am întors noi o datorie              — cheltuială
//  repaid = ni s-a întors o datorie              — venit
//  borrow = am luat cu împrumut (datorăm noi)    — venit
export function classifyDebt(kind, text) {
  const n = norm(text).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!n || !DEBT.test(n) && !(BACK.test(n) && /datori|долг/.test(n))) return null
  const back = BACK.test(n)
  let type
  if (kind === 'expense') type = back && FROM.test(n) ? 'repay' : back ? 'repay' : 'lend'
  else if (kind === 'income') type = back ? 'repaid' : FROM.test(n) ? 'borrow' : 'repaid'
  else return null
  // „datorie octavian” → lend; dar „am întors datoria” fără nume, la cheltuială = repay
  if (kind === 'expense' && back) type = 'repay'
  const direction = type === 'lend' || type === 'repaid' ? 'owed_to_us' : 'we_owe'
  // persoana: ce rămâne după cuvintele-cheie, în forma scrisă de om
  const words = String(text || '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/[\s-]+/).filter(Boolean)
  const keep = words.filter((w) => { const x = norm(w); return !DEBT.test(' ' + x) && !BACK.test(' ' + x) && !FILLER.has(x) && !/^\d/.test(x) && !/^(lei|mdl|eur|euro|usd|леев|лей)$/.test(x) })
  const person = keep.join(' ').replace(/^\p{L}/u, (c) => c.toUpperCase()).slice(0, 60) || null
  return { type, direction, person }
}
// Aceeași persoană? („Danu” ≈ „danu”, „Octavian P.” ≈ „Octavian”)
export function samePerson(a, b) {
  const x = norm(a).replace(/[^\p{L}\s]/gu, '').trim(), y = norm(b).replace(/[^\p{L}\s]/gu, '').trim()
  if (!x || !y) return false
  const a1 = x.split(' ')[0], b1 = y.split(' ')[0]
  // „Mama” ≈ „mamei”, „Danu” ≈ „lui Danu”: același început de nume
  let k = 0
  while (k < a1.length && k < b1.length && a1[k] === b1[k]) k++
  return x === y || a1 === b1 || (k >= 3 && k >= Math.min(a1.length, b1.length) - 1)
}
