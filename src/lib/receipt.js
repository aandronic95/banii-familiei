// Găsește totalul și magazinul în textul citit de pe un bon (OCR).
// Bonurile fiscale din Moldova: „TOTAL”, „SUMA TOTALA”, „TOTAL DE PLATA”, „ИТОГО”, „Spre plata”.

const TOTAL_RE = /(total\s*(de\s*plat[aă])?|suma\s*total[aă]?|spre\s*plat[aă]|de\s*achitat|итого|к\s*оплате|всего|sum[aă]\s*de\s*plat[aă]|amount\s*due)/i
const SKIP_RE = /(tva|nds|ндс|rest|сдача|numerar\s*primit|primit|cash\s*in|card\s*\*|discount|reducere|cotă|cota|subtotal)/i

function numbersIn(line) {
  const out = []
  const re = /(\d{1,3}(?:[  ]\d{3})+|\d+)[.,](\d{2})(?!\d)/g
  let m
  while ((m = re.exec(line))) out.push(Math.round(parseFloat(m[1].replace(/[  ]/g, '') + '.' + m[2]) * 100) / 100)
  return out
}

export function extractReceipt(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  let total = null

  // 1. Rândul cu „TOTAL” (sau rândul de sub el, dacă suma e pe rândul următor)
  for (let i = lines.length - 1; i >= 0 && total === null; i--) {
    if (TOTAL_RE.test(lines[i]) && !/subtotal/i.test(lines[i])) {
      const here = numbersIn(lines[i])
      const below = i + 1 < lines.length ? numbersIn(lines[i + 1]) : []
      const pick = here.length ? here[here.length - 1] : below.length ? below[0] : null
      if (pick && pick > 0) total = pick
    }
  }
  // 2. Altfel, cea mai mare sumă cu zecimale care nu e pe un rând de TVA/rest
  if (total === null) {
    const all = lines.filter((l) => !SKIP_RE.test(l)).flatMap(numbersIn).filter((v) => v > 0 && v < 1_000_000)
    if (all.length) total = Math.max(...all)
  }

  // Magazinul: primul rând cu destule litere (de obicei „SRL ...” sau numele rețelei)
  let merchant = null
  for (const l of lines.slice(0, 6)) {
    const letters = (l.match(/[A-Za-zĂÂÎȘȚăâîșțА-Яа-я]/g) || []).length
    if (letters >= 3 && !/^(bon|чек|fiscal|cod fiscal|idno|adresa|str\.?|mun\.?|tel)/i.test(l)) {
      merchant = l.replace(/\b(S\.?R\.?L\.?|SRL|S\.?A\.?|I\.?I\.?|ICS|ООО|SC)\b/gi, '').replace(/["„”«»]/g, '').replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
      if (merchant.length >= 3) break
      merchant = null
    }
  }
  return { total, merchant }
}
