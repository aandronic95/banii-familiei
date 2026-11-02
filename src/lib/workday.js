// Zile lucrătoare în Moldova: weekend + sărbătorile legale (inclusiv Paștele ortodox și Paștele Blajinilor).
// O plată programată pe o zi nelucrătoare se poate muta pe ziua lucrătoare dinainte sau de după.
const DAY = 86400000
const iso = (t) => new Date(t).toISOString().slice(0, 10)

// Paștele ortodox (calendarul iulian, convertit în gregorian; valabil 1900–2099)
export function orthodoxEaster(y) {
  const a = y % 4, b = y % 7, c = y % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1
  return iso(Date.UTC(y, month - 1, day) + 13 * DAY)
}

const FIXED = ['01-01', '01-07', '01-08', '03-08', '05-01', '05-09', '06-01', '08-27', '08-31', '12-25']
export function isHoliday(d) {
  if (FIXED.includes(d.slice(5))) return true
  const e = Date.parse(orthodoxEaster(Number(d.slice(0, 4))))
  return [0, 1, 8].some((k) => iso(e + k * DAY) === d)
}
export function isWorkday(d) {
  const wd = new Date(d + 'T12:00:00Z').getUTCDay()
  return wd !== 0 && wd !== 6 && !isHoliday(d)
}
// mode: 'none' | 'before' | 'after'
export function shiftWorkday(d, mode) {
  if (!d || !mode || mode === 'none') return d
  let t = Date.parse(d + 'T00:00:00Z')
  for (let i = 0; i < 10 && !isWorkday(iso(t)); i++) t += (mode === 'before' ? -1 : 1) * DAY
  return iso(t)
}
