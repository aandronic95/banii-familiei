// Calculator sigur pentru câmpul sumă (fără eval): + − × ÷ și paranteze.
// „150+35,5” → 185.5 · „3×120” → 360 · text invalid → null
export function evalAmount(input) {
  const src = String(input ?? '')
    .replace(/[\s ]/g, '')
    .replace(/,/g, '.')
    .replace(/[×x*]/g, '*')
    .replace(/[÷:/]/g, '/')
    .replace(/[−–]/g, '-')
  if (!src || !/^[\d.+\-*/()]+$/.test(src)) return null
  let i = 0
  const peek = () => src[i]
  function num() {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i))
    if (!m) throw new Error('num')
    i += m[0].length
    return parseFloat(m[0])
  }
  function factor() {
    if (peek() === '-') { i++; return -factor() }
    if (peek() === '(') {
      i++
      const v = expr()
      if (src[i++] !== ')') throw new Error('paren')
      return v
    }
    return num()
  }
  function term() {
    let v = factor()
    while (peek() === '*' || peek() === '/') {
      const op = src[i++]
      const r = factor()
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  function expr() {
    let v = term()
    while (peek() === '+' || peek() === '-') {
      const op = src[i++]
      const r = term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  try {
    const v = expr()
    return i === src.length && isFinite(v) ? v : null
  } catch (_) {
    return null
  }
}

export const isExpression = (s) => /\d\s*[+\-−×x*/÷:]\s*[\d(]/.test(String(s || ''))
