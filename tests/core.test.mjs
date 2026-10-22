// Teste pentru logica sensibilă: semnătura Telegram, secretele derivate și graficul de credit.
// Rulează cu: npm test (Node 22, citește direct fișierele .ts ale serverului)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, createHash } from 'node:crypto'
import { schedule, loanStatus, addMonths } from '../src/lib/loan.js'

const tgMod = await import('../supabase/functions/_shared/telegram.ts').catch(() => null)
const loanTs = await import('../supabase/functions/_shared/loan.ts').catch(() => null)

function signInitData(botToken, fields) {
  const dcs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(dcs).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}

test('semnătură Telegram validă este acceptată', { skip: !tgMod }, async () => {
  const token = '123456:TEST-token'
  const now = Math.floor(Date.now() / 1000)
  const init = signInitData(token, { auth_date: String(now), query_id: 'AAA', user: JSON.stringify({ id: 42, first_name: 'Ion' }) })
  const u = await tgMod.verifyInitData(init, token)
  assert.equal(u?.id, 42)
})

test('semnătură falsă sau token greșit este respinsă', { skip: !tgMod }, async () => {
  const now = Math.floor(Date.now() / 1000)
  const init = signInitData('123456:REAL', { auth_date: String(now), user: JSON.stringify({ id: 42 }) })
  assert.equal(await tgMod.verifyInitData(init, '123456:OTHER'), null)
  const tampered = init.replace('%3A42', '%3A43')
  assert.equal(await tgMod.verifyInitData(tampered, '123456:REAL'), null)
})

test('initData expirat este respins', { skip: !tgMod }, async () => {
  const token = '1:x'
  const old = Math.floor(Date.now() / 1000) - 3 * 86400
  const init = signInitData(token, { auth_date: String(old), user: JSON.stringify({ id: 1 }) })
  assert.equal(await tgMod.verifyInitData(init, token), null)
})

test('secretul derivat coincide cu cel calculat în GitHub Actions (sha256sum)', { skip: !tgMod }, async () => {
  const token = '777:abc'
  const shell = createHash('sha256').update('webhook:' + token).digest('hex').slice(0, 48)
  assert.equal(await tgMod.derivedSecret(token, 'webhook'), shell)
  const cron = createHash('sha256').update('cron:' + token).digest('hex').slice(0, 48)
  assert.equal(await tgMod.derivedSecret(token, 'cron'), cron)
})

test('graficul anuitar: suma corpului = suma creditului, sold final 0', () => {
  const l = { principal: 750000, annual_rate: 8.2, term_months: 240, first_due: '2021-09-24' }
  const s = schedule(l)
  assert.equal(s.length, 240)
  const sumP = s.reduce((a, x) => a + x.principal, 0)
  assert.ok(Math.abs(sumP - 750000) < 0.05, `sumă corp ${sumP}`)
  assert.equal(s.at(-1).balance, 0)
  assert.ok(Math.abs(s[0].payment - 6366.97) < 0.01, `rata ${s[0].payment}`)
})

test('starea creditului ține cont de ratele plătite înainte', () => {
  const l = { id: 'a', principal: 120000, annual_rate: 14.9, term_months: 48, first_due: '2024-11-10', paid_before: 22 }
  const st = loanStatus(l, [{ loan_id: 'a', n: 23 }])
  assert.equal(st.next.n, 24)
  assert.equal(st.paidCount, 23)
  assert.ok(st.remaining > 0 && st.remaining < 120000)
})

test('adăugarea de luni păstrează ziua sau trece la ultima zi a lunii', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2026-10-24', 3), '2027-01-24')
})

test('logica de credit e identică în aplicație și pe server', { skip: !loanTs }, () => {
  const l = { principal: 64300, annual_rate: 14.9, term_months: 24, first_due: '2026-11-10', monthly_payment: 3250 }
  assert.deepEqual(loanTs.schedule(l), schedule(l))
})

const bnmTs = await import('../supabase/functions/_shared/bnm.ts').catch(() => null)
test('cursul BNM se citește corect din XML (format real bnm.md)', { skip: !bnmTs }, () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><ValCurs Date="21.10.2026" name="Cursul oficial de schimb">
  <Valute ID="47"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Euro</Name><Value>20.1260</Value></Valute>
  <Valute ID="44"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Dolar S.U.A.</Name><Value>17.9568</Value></Valute>
  <Valute ID="36"><NumCode>643</NumCode><CharCode>RUB</CharCode><Nominal>1</Nominal><Name>Rubla</Name><Value>0.2201</Value></Valute>
  <Valute ID="5"><NumCode>348</NumCode><CharCode>HUF</CharCode><Nominal>100</Nominal><Name>Forint</Name><Value>5.1000</Value></Valute></ValCurs>`
  assert.deepEqual(bnmTs.parseBnmXml(xml), { EUR: 20.126, USD: 17.9568 })
  assert.deepEqual(bnmTs.parseBnmXml('<html>eroare</html>'), {})
})

test('calculatorul din câmpul sumă', async () => {
  const { evalAmount, isExpression } = await import('../src/lib/calc.js')
  assert.equal(evalAmount('150+35,5'), 185.5)
  assert.equal(evalAmount('3×120'), 360)
  assert.equal(evalAmount('1 000 − 250'), 750)
  assert.equal(evalAmount('(100+20)/2'), 60)
  assert.equal(evalAmount('385,50'), 385.5)
  assert.equal(evalAmount('alert(1)'), null)
  assert.equal(evalAmount('5+'), null)
  assert.equal(isExpression('150+35'), true)
  assert.equal(isExpression('150,35'), false)
})

test('dobânda acumulată la obligațiuni (exemplul eVMS: 2000 MDL, 7,45%, 16 zile = 6,53)', async () => {
  const { accruedInterest } = await import('../src/lib/invest.js')
  assert.equal(accruedInterest(2000, 7.45, '2026-10-06', '2026-10-22'), 6.53)
  assert.equal(accruedInterest(2000, 7.45, '2026-10-06', '2027-10-06'), 149)
  assert.equal(accruedInterest(2000, null, '2026-10-06', '2026-10-22'), 0)
})
