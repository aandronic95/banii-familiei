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

const walletTs = await import('../supabase/functions/_shared/wallet.ts').catch((e) => { console.error(e); return null })
test('Apple Pay: suma se citește în orice format de telefon', { skip: !walletTs }, () => {
  const p = walletTs.parseWalletAmount
  assert.deepEqual(p('385,50 MDL'), { amount: 385.5, currency: 'MDL' })
  assert.deepEqual(p('MDL 1 234,56'), { amount: 1234.56, currency: 'MDL' })
  assert.deepEqual(p('1.234,56 lei'), { amount: 1234.56, currency: 'MDL' })
  assert.deepEqual(p('€12,30'), { amount: 12.3, currency: 'EUR' })
  assert.deepEqual(p('$1,234.56'), { amount: 1234.56, currency: 'USD' })
  assert.deepEqual(p('12.30'), { amount: 12.3, currency: 'MDL' })
  assert.deepEqual(p('-45,00 MDL'), { amount: 45, currency: 'MDL' })
  assert.equal(p(''), null)
  assert.equal(p('abc'), null)
  assert.equal(p('0,00 MDL'), null)
})
test('Apple Pay: plata ajunge la contul potrivit', { skip: !walletTs }, () => {
  const accs = [
    { id: 'a', name: 'MAIB Visa', type: 'card', currency: 'MDL', bank: 'MAIB', last4: '4821', member_id: 'm2' },
    { id: 'b', name: 'MICB Mastercard', type: 'card', currency: 'MDL', bank: 'MICB', last4: '1093', member_id: 'm1' },
    { id: 'r', name: 'Revolut', type: 'card', currency: 'EUR', bank: 'Revolut', member_id: 'm1', wallet_alias: 'Revolut Metal' },
    { id: 'c', name: 'Portofel', type: 'cash', currency: 'MDL' },
  ]
  const m = walletTs.matchAccount
  assert.equal(m('Visa •••• 4821', 'MDL', accs).account.id, 'a')
  assert.equal(m('Revolut Metal', 'EUR', accs).account.id, 'r')
  assert.equal(m('MICB Mastercard', 'MDL', accs).account.id, 'b')
  const unknown = m('Card necunoscut', 'MDL', accs, 'm1')
  assert.equal(unknown.account.id, 'b')
  assert.equal(unknown.sure, false)
})
test('Apple Pay: categoria după magazin', { skip: !walletTs }, () => {
  const g = walletTs.guessCategoryIcon
  assert.equal(g('LINELLA SRL'), 'cart')
  assert.equal(g('Lukoil Moldova'), 'car')
  assert.equal(g('Farmacia Familiei'), 'heart')
  assert.equal(g('Ceva necunoscut'), null)
})

const quickTs = await import('../supabase/functions/_shared/quick.ts').catch((e) => { console.error(e); return null })
test('mesaj la bot: se înțelege suma, tipul, contul și categoria', { skip: !quickTs }, () => {
  const p = quickTs.parseQuick
  let q = p('cafea 45')
  assert.equal(q.amount, 45); assert.equal(q.kind, 'expense'); assert.equal(q.categoryIcon, 'ticket'); assert.equal(q.description, 'Cafea')
  q = p('benzină 900 cash')
  assert.equal(q.amount, 900); assert.equal(q.cash, true); assert.equal(q.categoryIcon, 'car'); assert.equal(q.isFuel, true)
  q = p('+salariu 14 200')
  assert.equal(q.kind, 'income'); assert.equal(q.amount, 14200)
  q = p('salariu 14200')
  assert.equal(q.kind, 'income')
  q = p('linella 385,50 maib')
  assert.equal(q.amount, 385.5); assert.equal(q.categoryIcon, 'cart')
  q = p('20€ revolut netflix')
  assert.equal(q.amount, 20); assert.equal(q.currency, 'EUR')
  q = p('farmacie 120 lei')
  assert.equal(q.amount, 120); assert.equal(q.currency, 'MDL'); assert.equal(q.categoryIcon, 'heart')
  q = p('benzină 900 #vacanta-mare #Drum')
  assert.equal(q.amount, 900); assert.deepEqual(q.tags, ['vacanta-mare', 'drum']); assert.equal(q.description, 'Benzină')
  assert.equal(p('salut'), null)
  assert.equal(p('/start'), null)
  const accs = [
    { id: 'a', name: 'MAIB Visa', type: 'card', currency: 'MDL', bank: 'MAIB', member_id: 'm2' },
    { id: 'b', name: 'MICB', type: 'card', currency: 'MDL', bank: 'MICB', member_id: 'm1' },
    { id: 'r', name: 'Revolut', type: 'card', currency: 'EUR', bank: 'Revolut', member_id: 'm1' },
    { id: 'c', name: 'Portofel', type: 'cash', currency: 'MDL' },
  ]
  assert.equal(quickTs.pickAccount(p('benzină 900 cash'), accs, 'm1').id, 'c')
  assert.equal(quickTs.pickAccount(p('linella 385,50 maib'), accs, 'm1').id, 'a')
  assert.equal(quickTs.pickAccount(p('20€ revolut netflix'), accs, 'm1').id, 'r')
  assert.equal(quickTs.pickAccount(p('cafea 45'), accs, 'm1').id, 'b')
})

test('plăți recurente: următoarea dată', async () => {
  const { nextOccurrence } = await import('../supabase/functions/_shared/loan.ts')
  assert.equal(nextOccurrence('2026-10-05', 1, 5), '2026-11-05')
  assert.equal(nextOccurrence('2026-01-31', 1, 31), '2026-02-28')
  assert.equal(nextOccurrence('2026-02-28', 1, 31), '2026-03-31')
  assert.equal(nextOccurrence('2026-11-10', 3, 10), '2027-02-10')
})

test('import CSV: format Revolut', async () => {
  const c = await import('../src/lib/csv.js')
  const text = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n' +
    'CARD_PAYMENT,Current,2026-10-12 16:05:33,2026-10-13 09:00:01,Linella,-12.30,0.00,EUR,COMPLETED,140.00\n' +
    'TOPUP,Current,2026-10-10 10:00:00,2026-10-10 10:00:05,"Top-Up by *1093",100.00,0.00,EUR,COMPLETED,152.30\n' +
    'CARD_PAYMENT,Current,2026-10-11 12:00:00,,Netflix,-9.99,0.00,EUR,REVERTED,152.30\n' +
    'TRANSFER,Current,2026-10-09 08:00:00,2026-10-09 08:00:00,"To Ana, Popescu",-50.00,0.50,EUR,COMPLETED,52.30\n'
  const { rows } = c.parseCSV(text)
  const cols = c.detectColumns(rows)
  assert.ok(cols)
  const tx = c.toTransactions(rows, cols)
  assert.equal(tx.length, 3)
  assert.deepEqual(tx[0], { date: '2026-10-13', kind: 'expense', amount: 12.3, description: 'Linella', currency: 'EUR' })
  assert.equal(tx[1].kind, 'income'); assert.equal(tx[1].amount, 100)
  assert.equal(tx[2].amount, 50.5); assert.equal(tx[2].description, 'To Ana, Popescu')
})

test('import CSV: bancă cu ; și coloane debit/credit, date românești', async () => {
  const c = await import('../src/lib/csv.js')
  const text = 'Extras de cont\nCont: MD00XX\n\nData tranzacției;Descriere;Debit;Credit;Sold\n' +
    '21.10.2026;Plata cu cardul LINELLA SRL;385,50;;12 014,50\n' +
    '05.10.2026;Salariu octombrie;;14 200,00;12 400,00\n' +
    '04.10.2026;Comision deservire;5,00;;-\n'
  const { rows, sep } = c.parseCSV(text)
  assert.equal(sep, ';')
  const cols = c.detectColumns(rows)
  const tx = c.toTransactions(rows, cols)
  assert.equal(tx.length, 3)
  assert.deepEqual(tx[0], { date: '2026-10-21', kind: 'expense', amount: 385.5, description: 'Plata cu cardul LINELLA SRL', currency: null })
  assert.equal(tx[1].kind, 'income'); assert.equal(tx[1].amount, 14200)
  assert.equal(c.parseSigned('(45.00)'), -45)
  assert.equal(c.parseDate('12/10/26'), '2026-10-12')
})

test('bon: totalul și magazinul din textul OCR', async () => {
  const { extractReceipt } = await import('../src/lib/receipt.js')
  const bon1 = `"LINELLA" S.R.L.\nCod fiscal 1003600000000\nmun. Chisinau, str. Ismail 1\nPaine alba 1 x 9,50 9,50\nLapte 2.5% 2 x 18,90 37,80\nCafea 1 x 338,20 338,20\nTOTAL 385,50\nTVA 20% 64,25\nNumerar primit 400,00\nRest 14,50`
  assert.deepEqual(extractReceipt(bon1), { total: 385.5, merchant: 'LINELLA' })
  const bon2 = `ПЕТРОМ МОЛДОВА\nБензин 95 38,20 л x 24,87\nИТОГО\n950,00\nНДС 158,33`
  assert.equal(extractReceipt(bon2).total, 950)
  const bon3 = `Farmacia Familiei\nParacetamol 25,00\nVitamina C 1 234,50\nCard ****1093`
  assert.equal(extractReceipt(bon3).total, 1234.5)
  assert.deepEqual(extractReceipt(''), { total: null, merchant: null })
})

const pinTs = await import('../supabase/functions/_shared/pin.ts').catch((e) => { console.error(e); return null })
test('cod de rezervă: amprentă, verificare și limită de încercări', { skip: !pinTs }, async () => {
  const salt = pinTs.newSalt()
  const h = await pinTs.hashPin('1234', salt)
  assert.equal(h.length, 64)
  assert.ok(pinTs.safeEqual(h, await pinTs.hashPin('1234', salt)))
  assert.ok(!pinTs.safeEqual(h, await pinTs.hashPin('1235', salt)))
  assert.notEqual(h, await pinTs.hashPin('1234', pinTs.newSalt()))
  assert.ok(pinTs.validPin('0000')); assert.ok(!pinTs.validPin('123')); assert.ok(!pinTs.validPin('12a4'))
  assert.equal(pinTs.lockMinutes(4), 0); assert.equal(pinTs.lockMinutes(5), 1); assert.equal(pinTs.lockMinutes(7), 4); assert.equal(pinTs.lockMinutes(20), 60)
})

test('dobânda „vie”: cu fracțiuni de zi, egală cu eVMS la miezul nopții, oprită la scadență', async () => {
  const { liveAccrued, perDay, accruedInterest } = await import('../src/lib/invest.js')
  const s = Date.parse('2026-10-06'), day = 86400000
  assert.ok(Math.abs(liveAccrued(2000, 7.45, s, null, s + 16 * day) - accruedInterest(2000, 7.45, '2026-10-06', '2026-10-22')) < 0.005)
  const half = liveAccrued(2000, 7.45, s, null, s + 16.5 * day) - liveAccrued(2000, 7.45, s, null, s + 16 * day)
  assert.ok(Math.abs(half - perDay(2000, 7.45) / 2) < 1e-9)
  const end = Date.parse('2027-10-06')
  assert.equal(liveAccrued(2000, 7.45, s, end, end + 50 * day), liveAccrued(2000, 7.45, s, end, end))
  assert.equal(liveAccrued(2000, null, s, null, s + day), 0)
  assert.ok(liveAccrued(2000, 7.45, s, null, s + 1000) > 0) // crește deja după o secundă
})

test('abonamente: găsește plățile lunare cu sumă constantă, ignoră restul', async () => {
  const { detectSubscriptions, suggestBudget, merchantKey } = await import('../src/lib/insights.js')
  assert.equal(merchantKey('NETFLIX.COM 4821'), 'netflix')
  assert.equal(merchantKey('Orange Moldova S.A.'), 'orange moldova')
  const tx = (date, amount, merchant) => ({ date, amount, merchant, account_id: 'a', category_id: 'c' })
  const txs = [
    tx('2026-06-12', 199, 'NETFLIX.COM'), tx('2026-07-12', 199, 'Netflix.com'), tx('2026-08-12', 199, 'NETFLIX.COM'), tx('2026-09-12', 209, 'NETFLIX.COM'), tx('2026-10-12', 209, 'NETFLIX.COM'),
    tx('2026-08-03', 250, 'Starnet'), tx('2026-09-03', 250, 'Starnet'), tx('2026-10-02', 250, 'Starnet'),
    // Linella: des, sume diferite → nu e abonament
    tx('2026-08-01', 385, 'Linella'), tx('2026-08-04', 120, 'Linella'), tx('2026-09-02', 960, 'Linella'), tx('2026-10-05', 45, 'Linella'),
    // s-a oprit în iunie
    tx('2026-04-01', 99, 'Spotify'), tx('2026-05-01', 99, 'Spotify'), tx('2026-06-01', 99, 'Spotify'),
    // doar de două ori
    tx('2026-09-20', 500, 'Sală fitness'), tx('2026-10-20', 500, 'Sală fitness'),
  ]
  const s = detectSubscriptions(txs, '2026-10-23')
  assert.deepEqual(s.map((x) => x.key), ['starnet', 'netflix']) // cele mai scumpe pe an primele
  assert.equal(s[1].monthly, 199)
  assert.equal(s[1].yearly, 2388)
  assert.equal(s[0].day, 2)
  assert.equal(suggestBudget([6200, 7100, 6850]), 6800)
  assert.equal(suggestBudget([310, 280, 0]), 200)
  assert.equal(suggestBudget([0, 0, 0]), 0)
})

test('cod QR de pe bonul fiscal (MEV)', async () => {
  const { parseFiscalQr } = await import('../src/lib/fiscal.js')
  const a = parseFiscalQr('https://mev.sfs.md/receipt-verifier/J403001576/116.73/31/2026-10-21')
  assert.deepEqual([a.amount, a.date, a.code, a.number, a.ref], [116.73, '2026-10-21', 'J403001576', '31', 'J403001576/31/2026-10-21'])
  assert.ok(a.url.startsWith('https://mev.sfs.md/'))
  const b = parseFiscalQr('https://mev.sfs.md/receipt-verifier/J702003032/385,50/2405/21.10.2026')
  assert.deepEqual([b.amount, b.date, b.code], [385.5, '2026-10-21', 'J702003032'])
  const c = parseFiscalQr('https://mev.sfs.md/receipt-verifier/J702003032/150/12/2026-10-21')
  assert.equal(c.amount, 150)
  assert.equal(parseFiscalQr('salut'), null)
  assert.equal(parseFiscalQr(''), null)
  const h = parseFiscalQr('https://mev.sfs.md/receipt-verifier/F5EBCB96BE4D58BA606648B079C6DAFE')
  assert.deepEqual([h.ref, h.needsPage, h.amount], ['MEV:F5EBCB96BE4D58BA606648B079C6DAFE', true, null])
})

test('restaurare din backup: nu dublează, potrivește conturile și categoriile după nume', async () => {
  const { planRestore } = await import('../src/lib/restore.js')
  const ctx = {
    accounts: [{ id: 'a1', name: 'MAIB Visa' }, { id: 'a2', name: 'Portofel' }],
    categories: [{ id: 'c1', kind: 'expense', name_ro: 'Mâncare', name_ru: 'Продукты' }, { id: 'i1', kind: 'income', name_ro: 'Salariu', name_ru: 'Зарплата' }],
    members: [{ id: 'm1', name: 'Andrian' }],
    transactions: [{ id: '11111111-1111-4111-8111-111111111111', date: '2026-10-01', amount: 100, account_id: 'a1', merchant: 'Linella' }],
  }
  const rows = [
    { Data: '2026-10-01', Tip: 'Cheltuială', Suma: -100, Cont: 'MAIB Visa', Categorie: 'Mâncare', 'Magazin / descriere': 'Linella', ID: '11111111-1111-4111-8111-111111111111' }, // există (ID)
    { Data: '2026-10-01', Tip: 'Cheltuială', Suma: -100, Cont: 'MAIB Visa', 'Magazin / descriere': 'linella' }, // există (aceleași date)
    { Data: '2026-10-02', Tip: 'Cheltuială', Suma: -45.5, Cont: 'Portofel', Categorie: 'Mâncare', Cine: 'Andrian', Etichete: '#vacanta', ID: '22222222-2222-4222-8222-222222222222' },
    { Дата: '2026-10-05', Тип: 'Доход', Сумма: 14200, Счёт: 'maib visa', Категория: 'Зарплата' },
    { Data: '2026-10-03', Tip: 'Transfer', Suma: -500, Cont: 'MAIB Visa', 'În contul': 'Portofel' },
    { Data: '2026-10-04', Tip: 'Cheltuială', Suma: -10, Cont: 'Cont șters' },
  ]
  const p = planRestore(rows, ctx)
  assert.equal(p.dup, 2)
  assert.equal(p.insert.length, 3)
  assert.deepEqual(p.insert[0], { kind: 'expense', date: '2026-10-02', amount: 45.5, account_id: 'a2', merchant: null, note: null, category_id: 'c1', member_id: 'm1', tags: ['vacanta'], id: '22222222-2222-4222-8222-222222222222' })
  assert.equal(p.insert[1].kind, 'income'); assert.equal(p.insert[1].category_id, 'i1')
  assert.equal(p.insert[2].to_account_id, 'a2')
  assert.equal(p.skipped.length, 1); assert.equal(p.skipped[0].why, 'account')
})

test('bunuri: mașina pierde din valoare în timp', async () => {
  const { assetValue } = await import('../src/lib/invest.js')
  assert.equal(assetValue(10000, 12, '2026-10-23', '2026-10-23'), 10000)
  assert.ok(Math.abs(assetValue(10000, 12, '2026-10-23', '2027-10-23') - 8800) < 2)
  assert.ok(Math.abs(assetValue(10000, 12, '2026-10-23', '2028-10-22') - 7744) < 3)
  assert.equal(assetValue(10000, 0, '2026-10-23', '2030-01-01'), 10000)
  assert.ok(Math.abs(assetValue(8800, 12, '2027-10-23', '2026-10-23') - 10000) < 3) // înapoi în timp: valoarea era mai mare
})

test('verificare: dubluri și transferuri ascunse', async () => {
  const { findDuplicates, findHiddenTransfers } = await import('../src/lib/checks.js')
  const tx = (id, kind, amount, account_id, date, merchant, extra = {}) => ({ id, kind, amount, account_id, date, merchant, ...extra })
  const txs = [
    tx('1', 'expense', 385.5, 'a', '2026-10-20', 'LINELLA SRL'),
    tx('2', 'expense', 385.5, 'a', '2026-10-21', 'Linella'),            // dublura lui 1 (Apple Pay + import)
    tx('3', 'expense', 45, 'a', '2026-10-21', 'Cafea'),
    tx('4', 'expense', 45, 'a', '2026-10-21', 'Ceai'),                   // aceeași sumă, alt lucru: nu e dublură
    tx('5', 'expense', 2000, 'maib', '2026-10-15', 'Top-up Revolut'),
    tx('6', 'income', 100, 'rev', '2026-10-16', 'Top-Up by *4821'),       // 100 EUR ≈ 2000 MDL
    tx('7', 'expense', 900, 'a', '2026-10-10', null, { split_id: 's' }),
    tx('8', 'expense', 900, 'a', '2026-10-10', null, { split_id: 's' }),  // părți din același bon: nu
    tx('9', 'income', 14200, 'maib', '2026-10-05', 'Salariu'),
  ]
  const d = findDuplicates(txs)
  assert.deepEqual(d.map((x) => [x.keep.id, x.dup.id]), [['1', '2']])
  assert.equal(findDuplicates(txs, { ignored: ['1+2'] }).length, 0)
  const rate = { maib: 1, a: 1, rev: 20 }
  const h = findHiddenTransfers(txs, (x) => x.amount * rate[x.account_id])
  assert.deepEqual(h.map((x) => [x.out.id, x.in.id]), [['5', '6']])
})

test('plata recurentă care dublează rata creditului e recunoscută (aplicație = server)', async () => {
  const js = await import('../src/lib/loan.js')
  const l = { id: 'L', principal: 750000, annual_rate: 8.2, term_months: 240, first_due: '2021-09-27' }
  const pay = js.schedule(l).find((x) => x.due === '2026-10-27').payment
  const rec = { kind: 'expense', amount: Math.round(pay) - 14, next_date: '2026-10-27' }
  assert.equal(js.loanForRecurring(rec, [l])?.id, 'L')
  assert.equal(js.loanForRecurring({ ...rec, amount: 250 }, [l]), null)          // internet: nu
  assert.equal(js.loanForRecurring({ ...rec, next_date: '2026-10-12' }, [l]), null) // altă zi: nu
  assert.equal(js.loanForRecurring({ ...rec, kind: 'income' }, [l]), null)
  assert.equal(js.loanForRecurring(rec, [{ ...l, closed: true }]), null)
  if (loanTs) assert.equal(loanTs.loanForRecurring(rec, [l])?.id, 'L')
})

test('textul bonului fiscal: toate pozițiile, totalul, data', async () => {
  const { parseReceiptText, itemsNote } = await import('../src/lib/fiscalText.js')
  const a = parseReceiptText(`"LINELLA" S.R.L.
COD FISCAL: 1003600012345
mun. Chișinău, str. Ion Creangă 10
Lapte Lapte 2.5% 1L
2.000 x 18.90 = 37.80 A
Pâine albă feliată 9.50 A
Ouă C1 10 buc 10 x 2.25 = 22.50 A
Banane 1.235 x 29.90 36.93 A
TOTAL 106.73
TVA A=20.00% 17.79
CARD 106.73
Bon fiscal nr. 31
21.10.2026 14:22:05`)
  assert.equal(a.merchant, 'LINELLA')
  assert.equal(a.date, '2026-10-21')
  assert.equal(a.total, 106.73)
  assert.deepEqual(a.items.map((x) => [x.name, x.qty, x.sum]), [['Lapte Lapte 2.5% 1L', 2, 37.8], ['Pâine albă feliată', 1, 9.5], ['Ouă C1 10 buc', 10, 22.5], ['Banane', 1.235, 36.93]])
  assert.equal(a.matches, true)
  assert.equal(itemsNote(a.items), 'Lapte Lapte 2.5% 1L ×2, Pâine albă feliată, Ouă C1 10 buc ×10, Banane ×1,235')
  // format rusesc, sume cu virgulă
  const b = parseReceiptText(`ООО "Фуршет"\nХлеб\n1 x 8,00 8,00\nМолоко 2 х 17,50 = 35,00\nИТОГО 43,00\n2026-10-20`)
  assert.equal(b.total, 43); assert.equal(b.items.length, 2); assert.equal(b.date, '2026-10-20'); assert.equal(b.matches, true)
  assert.equal(parseReceiptText('').items.length, 0)
})

const taskTs = await import('../supabase/functions/_shared/taskparse.ts').catch((e) => { console.error(e); return null })
test('sarcini scrise în cuvinte (aplicație = server)', async () => {
  const js = await import('../src/lib/taskparse.js')
  const M = [{ id: 'm1', name: 'Andrian' }, { id: 'm2', name: 'Soția' }, { id: 'm3', name: 'Ана' }]
  const o = { today: '2026-10-27', members: M } // marți
  const p = (x) => js.parseTask(x, o)
  let r = p('sarcină: schimbă uleiul vineri la 18:00 pentru Andrian')
  assert.deepEqual([r.title, r.due_date, r.due_time, r.assignee_id, r.explicit], ['Schimbă uleiul', '2026-10-30', '18:00', 'm1', true])
  r = p('plătește lumina 450 lei pe 15')
  assert.deepEqual([r.title, r.amount, r.money, r.due_date], ['Plătește lumina', 450, true, '2026-11-15'])
  r = p('udă florile în fiecare sâmbătă')
  assert.deepEqual([r.title, r.repeat, r.due_date], ['Udă florile', 'weekly', '2026-10-31'])
  r = p('Plătește chiria 5000 lunar pe 5')
  assert.deepEqual([r.amount, r.repeat, r.due_date], [5000, 'monthly', '2026-11-05'])
  r = p('ia copilul de la cerc azi 17:30 @soția')
  assert.deepEqual([r.title, r.due_date, r.due_time, r.assignee_id], ['Ia copilul de la cerc', '2026-10-27', '17:30', 'm2'])
  r = p('в пятницу забрать посылку для Аны')
  assert.deepEqual([r.title, r.due_date, r.assignee_id], ['Забрать посылку', '2026-10-30', 'm3'])
  r = p('Cumpără 2 pâini')
  assert.deepEqual([r.title, r.amount], ['Cumpără 2 pâini', null]) // numărul nu e sumă
  const s = p('cumpără: lapte, pâine 2, 10 ouă și brânză')
  assert.equal(s.kind, 'shopping')
  assert.deepEqual(s.items, [{ name: 'Lapte', qty: null }, { name: 'Pâine', qty: '2' }, { name: 'Ouă', qty: '10' }, { name: 'Brânză', qty: null }])
  assert.equal(js.nextDue('2026-10-27', 'weekly', 1, '2026-10-27'), '2026-11-03')
  assert.equal(js.nextDue('2026-01-31', 'monthly', 1, '2026-01-31'), '2026-02-28')
  assert.equal(js.nextDue('2026-10-01', 'daily', 1, '2026-10-27'), '2026-10-27') // bifată târziu: sare la azi
  assert.equal(js.nextDue('2026-10-01', 'none', 1, '2026-10-27'), null)
  if (taskTs) for (const x of ['sarcină: schimbă uleiul vineri la 18:00 pentru Andrian', 'plătește lumina 450 lei pe 15', 'cumpără: lapte, pâine 2', 'в пятницу забрать посылку для Аны'])
    assert.deepEqual(taskTs.parseTask(x, o), js.parseTask(x, o))
})

test('bot: alegerea contului după mesaj', async () => {
  const q = await import('../supabase/functions/_shared/quick.ts')
  const accs = [
    { id: 'c', name: 'Portofel', type: 'cash', currency: 'MDL', sort: 1 },
    { id: 'a', name: 'MAIB Visa', type: 'card', currency: 'MDL', sort: 2 },
    { id: 'r', name: 'Revolut', type: 'card', currency: 'EUR', sort: 3 },
    { id: 'x', name: 'Vechi', type: 'card', currency: 'MDL', sort: 4, archived: true },
    { id: 'm', name: 'Skoda', type: 'asset', currency: 'EUR', sort: 5 },
  ]
  const ch = q.accountChoices(accs)
  assert.deepEqual(ch.map((a) => a.id), ['c', 'a', 'r'])
  assert.equal(q.convertAmount(45, 'MDL', 'EUR', { EUR: 19.5, USD: 17.9 }), 2.31)
  assert.equal(q.convertAmount(10, 'EUR', 'MDL', { EUR: 19.5 }), 195)
  assert.equal(q.convertAmount(45, 'MDL', 'MDL', {}), 45)
  const kb = q.accountKeyboard('11111111-1111-4111-8111-111111111111', ch, 'a', false, 'https://x/')
  assert.deepEqual(kb.inline_keyboard[0].map((b) => b.text), ['💵 Portofel', '✓ MAIB Visa'])
  assert.equal(kb.inline_keyboard[1][0].text, '💳 Revolut · EUR')
  assert.ok(kb.inline_keyboard.flat().every((b) => !b.callback_data || b.callback_data.length <= 64)) // limita Telegram
})

test('dobânda cu plată periodică (cupon): eVMS la 6 luni, licitații anual', async () => {
  const { couponDates, couponInfo, accruedInterest } = await import('../src/lib/invest.js')
  assert.deepEqual(couponDates('2026-04-06', '2028-04-06', 'semiannual'), ['2026-10-06', '2027-04-06', '2027-10-06', '2028-04-06'])
  assert.deepEqual(couponDates('2026-01-31', '2026-05-15', 'monthly'), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-15'])
  assert.deepEqual(couponDates('2026-10-06', '2027-10-06', 'annual'), ['2027-10-06'])
  const c = couponInfo(2000, 7.45, '2026-04-06', '2028-04-06', 'semiannual', '2026-11-02')
  assert.equal(c.last, '2026-10-06'); assert.equal(c.next, '2027-04-06'); assert.equal(c.paid, 1); assert.equal(c.count, 4)
  assert.equal(c.nextAmount, accruedInterest(2000, 7.45, '2026-10-06', '2027-04-06'))
  assert.equal(c.paidTotal, accruedInterest(2000, 7.45, '2026-04-06', '2026-10-06'))
  assert.equal(couponInfo(2000, 7.45, '2026-04-06', '2028-04-06', 'maturity', '2026-11-02'), null)
})

const investTs = await import('../supabase/functions/_shared/invest.ts').catch(() => null)
test('cupoanele: aceeași logică în aplicație și pe server', { skip: !investTs }, async () => {
  const js = await import('../src/lib/invest.js')
  assert.deepEqual(investTs.couponDates('2026-04-06', '2028-04-06', 'semiannual'), js.couponDates('2026-04-06', '2028-04-06', 'semiannual'))
  assert.deepEqual(investTs.couponInfo(2000, 7.45, '2026-04-06', '2028-04-06', 'annual', '2027-05-01'), js.couponInfo(2000, 7.45, '2026-04-06', '2028-04-06', 'annual', '2027-05-01'))
})

test('casă și familie: zile de naștere, contoare, 50/30/20', async () => {
  const h = await import('../src/lib/home.js')
  assert.equal(h.nextEventDate('1990-11-05', '2026-11-02'), '2026-11-05')
  assert.equal(h.nextEventDate('1990-03-10', '2026-11-02'), '2027-03-10')
  assert.equal(h.nextEventDate('2000-02-29', '2027-01-01'), '2027-02-28')
  assert.equal(h.nextEventDate('2026-12-01', '2026-11-02', false), '2026-12-01')
  assert.equal(h.nextEventDate('2026-10-01', '2026-11-02', false), null)
  assert.equal(h.turning('1990-11-05', '2026-11-05', true), 36)
  assert.equal(h.turning('1990-11-05', '2026-11-05', false), null)
  const u = h.meterUsage([
    { date: '2026-08-01', value: 1000 }, { date: '2026-09-01', value: 1180 }, { date: '2026-10-01', value: 1390 },
    { date: '2026-10-15', value: 20 }, { date: '2026-11-01', value: 140 }, // contor schimbat la 15 oct
  ])
  assert.deepEqual(u.months, { '2026-09': 180, '2026-10': 210, '2026-11': 120 })
  assert.equal(u.last.value, 140)
  assert.equal(Math.round(u.perDay * 100) / 100, 7.06)
  const food = { id: 'f', icon: 'cart' }, fun = { id: 'x', icon: 'ticket' }, clothes = { id: 'c', icon: 'shirt', bucket: 'needs' }
  const r = h.rule503020([{ amount: 6000, category: food }, { amount: 4000, category: fun }, { amount: 1000, category: clothes }], 20000)
  assert.deepEqual([r.needs, r.wants, r.savings, r.pNeeds, r.pWants, r.pSavings], [7000, 4000, 9000, 35, 20, 45])
  assert.equal(r.topWants[0].category.id, 'x')
})

const homeTs = await import('../supabase/functions/_shared/home.ts').catch(() => null)
test('evenimente: aceeași logică în aplicație și pe server', { skip: !homeTs }, async () => {
  const js = await import('../src/lib/home.js')
  for (const [d, t] of [['1990-11-05', '2026-11-02'], ['2000-02-29', '2027-01-01'], ['1985-01-10', '2026-12-31']]) assert.equal(homeTs.nextEventDate(d, t), js.nextEventDate(d, t))
})

test('călătorie: total, pe zi, pe persoană, plan și restul pe zi', async () => {
  const { tripStats, tripOn } = await import('../src/lib/trip.js')
  const trip = { start_date: '2027-07-01', end_date: '2027-07-10', budget: 2000, people: 3, plan: [{ category_id: 'hotel', amount: 1200 }, { category_id: 'food', amount: 600 }] }
  const rate = { MDL: 1, EUR: 20 }
  const conv = (a, c) => (a * rate[c]) / rate.EUR
  const txs = [
    { kind: 'expense', amount: 1100, currency: 'EUR', category_id: 'hotel' },
    { kind: 'expense', amount: 2000, currency: 'MDL', category_id: 'food' }, // 100 EUR
    { kind: 'expense', amount: 50, currency: 'EUR', category_id: 'fun' },
    { kind: 'income', amount: 50, currency: 'EUR' }, // bani întorși
  ]
  const s = tripStats(trip, txs, conv, '2027-07-05')
  assert.equal(s.status, 'during'); assert.equal(s.days, 10); assert.equal(s.elapsed, 5)
  assert.equal(s.net, 1200); assert.equal(s.perDay, 240); assert.equal(s.perPerson, 400)
  assert.equal(s.left, 800); assert.equal(Math.round(s.allowPerDay * 100) / 100, Math.round((800 / 6) * 100) / 100)
  assert.deepEqual(s.rows.map((r) => [r.category_id, r.amount, r.spent]), [['hotel', 1200, 1100], ['food', 600, 100], ['fun', 0, 50]])
  assert.deepEqual(s.byCur, { EUR: 1150, MDL: 2000 })
  assert.equal(tripStats(trip, [], conv, '2027-06-01').status, 'before')
  assert.equal(tripOn([{ ...trip, tag: 'x', auto_tag: true }], '2027-07-10')?.tag, 'x')
  assert.equal(tripOn([{ ...trip, tag: 'x', auto_tag: false }], '2027-07-03'), null)
})

test('prețuri din bonuri: grupare, schimbare, cel mai ieftin magazin', async () => {
  const { priceIndex, productKey } = await import('../src/lib/prices.js')
  assert.equal(productKey('LAPTE  Lapte Bun 2.5% 1L'), productKey('lapte lapte bun 2.5% 1l'))
  assert.equal(productKey('Pâine albă'), 'paine alba')
  const p = priceIndex([
    { id: 1, date: '2026-09-01', merchant: 'Linella', items: [{ name: 'Lapte 2.5% 1L', qty: 2, price: 20, sum: 40 }, { name: 'Pâine', qty: 1, price: 8, sum: 8 }] },
    { id: 2, date: '2026-10-01', merchant: 'Nr1', items: [{ name: 'LAPTE 2.5% 1L', qty: 1, price: 0, sum: 22 }] },
    { id: 3, date: '2026-10-20', merchant: 'Linella', items: [{ name: 'Lapte 2.5% 1l', qty: 1, price: 21, sum: 21 }] },
  ])
  const milk = p.find((x) => x.key.startsWith('lapte'))
  assert.equal(milk.count, 3); assert.equal(milk.last, 21); assert.equal(milk.min, 20); assert.equal(milk.max, 22)
  assert.equal(Math.round(milk.change * 100), 5)
  assert.deepEqual(milk.shops.map((s) => s.merchant), ['Linella', 'Nr1'])
  assert.equal(p[0].key, milk.key)
})

const weeklyTs = await import('../supabase/functions/_shared/weekly.ts').catch((e) => { console.error(e); return null })
test('rezumat săptămânal: bare, top 3, comparație', { skip: !weeklyTs }, () => {
  const { weeklyText, bar } = weeklyTs
  assert.equal(bar(5, 10, 8), '▇▇▇▇░░░░'); assert.equal(bar(0.1, 10, 8), '▇░░░░░░░'); assert.equal(bar(0, 0, 4), '░░░░')
  const food = { ro: 'Alimente', ru: 'Продукты' }
  const txt = weeklyText({
    from: '2026-10-27', to: '2026-11-02', total: 50000,
    cur: [{ kind: 'income', date: '2026-10-30', mdl: 10000 }, { kind: 'expense', date: '2026-10-27', mdl: 600, merchant: 'Linella', cat: food },
      { kind: 'expense', date: '2026-10-29', mdl: 300, cat: food }, { kind: 'expense', date: '2026-11-01', mdl: 1200, merchant: 'Farmacia', cat: null }],
    prev: [{ kind: 'expense', date: '2026-10-22', mdl: 1500 }], trip: null,
  }, 'ro')
  assert.match(txt, /27 oct – 2 nov/)
  assert.match(txt, /Cheltuieli: −2 100 MDL \(▲ 40% față de săptămâna trecută\)/)
  assert.match(txt, /Economisit: 7 900 MDL/)
  assert.match(txt, /Ma ▇▇▇▇░░░░ 600/) // 27 oct 2026 e marți
  assert.match(txt, /1\. Farmacia — 1 200 MDL \(1 nov\)/)
  assert.match(txt, /3\. Alimente — 300 MDL/)
  assert.ok(weeklyText({ from: '2026-10-27', to: '2026-11-02', total: 0, cur: [], prev: [] }, 'ru').includes('расходов нет'))
})

const voiceTs = await import('../supabase/functions/_shared/voice.ts').catch((e) => { console.error(e); return null })
test('voce: fraza vorbită devine mesaj scurt', { skip: !voiceTs || !quickTs }, () => {
  const { normalizeSpoken: n, voiceConfig } = voiceTs
  assert.equal(n('Am cumpărat pâine de 12 lei.'), 'pâine 12 lei')
  assert.equal(n('Cafea, 45 de lei.'), 'Cafea 45 lei')
  assert.equal(n('Benzină, 1,200 lei, cash.'), 'Benzină 1200 lei cash')
  assert.equal(n('Venit salariu 14200'), '+salariu 14200')
  assert.equal(n('Купила хлеб за 12 леев.'), 'хлеб 12 lei')
  assert.equal(n('Sarcină, plătește lumina 450 lei pe 15.'), 'Sarcină: plătește lumina 450 lei pe 15')
  const q = quickTs.parseQuick(n('Кофе 45 леев'))
  assert.deepEqual([q.amount, q.description, q.categoryIcon], [45, 'Кофе', 'ticket'])
  assert.equal(quickTs.parseQuick('бензин 900 наличными').cash, true)
  assert.equal(voiceConfig(() => undefined), null)
  assert.equal(voiceConfig((k) => (k === 'VOICE_API_KEY' ? 'gsk_x' : undefined)).model, 'whisper-large-v3-turbo')
  assert.match(voiceConfig((k) => (k === 'VOICE_API_KEY' ? 'sk-x' : undefined)).url, /openai/)
})

test('extras PDF: coloane după antet, descriere pe două rânduri, antet repetat', async () => {
  const { pdfTable } = await import('../src/lib/pdftable.js')
  const { detectColumns, toTransactions } = await import('../src/lib/csv.js')
  const it = (str, x, y, page = 1, w = str.length * 4) => ({ str, x, y, w, page })
  const head = (y, p) => [it('Data', 40, y, p), it('Descriere', 120, y, p), it('Suma', 380, y, p), it('Sold', 480, y, p)]
  const items = [it('EXTRAS MAIB', 40, 20), ...head(60, 1),
    it('02.10.2026', 40, 75), it('Linella Botanica', 120, 75), it('-385,50', 372, 75), it('9 614,50', 470, 75),
    it('05.10.2026', 40, 90), it('Transfer primit', 120, 90), it('+16 500,00', 364, 90), it('26 114,50', 466, 90),
    it('de la ION', 120, 101),
    ...head(60, 2), it('07.10.2026', 40, 75, 2), it('Petrom', 120, 75, 2), it('-950,00', 372, 75, 2), it('25 164,50', 466, 75, 2)]
  const t = pdfTable(items)
  assert.equal(t.mode, 'table')
  const tx = toTransactions(t.rows, detectColumns(t.rows))
  assert.deepEqual(tx.map((x) => [x.date, x.kind, x.amount, x.description]), [
    ['2026-10-02', 'expense', 385.5, 'Linella Botanica'], ['2026-10-05', 'income', 16500, 'Transfer primit de la ION'], ['2026-10-07', 'expense', 950, 'Petrom']])
  // fără antet: dată + descriere + sumă (+ sold)
  const t2 = pdfTable([it('01.10.2026', 40, 50), it('Kaufland', 110, 50), it('1 234,56', 380, 50), it('8 000,00', 480, 50), it('03.10.2026', 40, 64), it('Salariu', 110, 64), it('+12 800,00', 370, 64), it('20 800,00', 476, 64)])
  assert.equal(t2.mode, 'lines')
  assert.deepEqual(toTransactions(t2.rows, detectColumns(t2.rows)).map((x) => [x.kind, x.amount]), [['expense', 1234.56], ['income', 12800]])
})

test('demo: date inventate coerente și client fără server', async () => {
  const { demoData, demoClient } = await import('../src/lib/demo.js')
  const d = demoData('2026-11-02')
  assert.equal(d.members.length, 3)
  assert.ok(d.transactions.length > 150)
  const ids = new Set(d.accounts.map((a) => a.id)), cats = new Set(d.categories.map((c) => c.id))
  assert.ok(d.transactions.every((x) => ids.has(x.account_id) && (!x.category_id || cats.has(x.category_id))))
  assert.ok(d.transactions.some((x) => x.items?.length) && d.transactions.some((x) => x.tags.includes('bulgaria')))
  assert.deepEqual(demoData('2026-11-02').transactions.map((x) => x.amount), d.transactions.map((x) => x.amount)) // repetabil
  const S = { ...d, userId: d.userId }
  const c = demoClient(S, { transactions: 'transactions' })
  const ins = await c.from('transactions').insert({ amount: 5 }).select().single()
  assert.ok(ins.data.id && ins.data.amount === 5 && !ins.error)
  const up = await c.from('transactions').update({ amount: 7 }).eq('id', d.transactions[0].id).select().single()
  assert.equal(up.data.amount, 7); assert.equal(up.data.account_id, d.transactions[0].account_id)
  assert.equal((await c.functions.invoke('docs')).error, null)
})

test('ghid: text sigur și comparația versiunilor', async () => {
  const { rich, compareVersion, GUIDE } = await import('../src/lib/guide.js')
  assert.equal(rich('**A** `b` <i> [x](https://g.com/a)'), '<b>A</b> <code>b</code> &lt;i&gt; <a href="https://g.com/a" data-ext="1">x</a>')
  assert.equal(rich('[x](javascript:alert(1))'), '[x](javascript:alert(1))')
  assert.equal(compareVersion({ sha: 'abc1234' }, { sha: 'abc1234def' }), 'current')
  assert.equal(compareVersion({ sha: 'aaa', date: '2026-11-01T10:00:00Z' }, { sha: 'bbb', date: '2026-11-02T10:00:00Z' }), 'behind')
  assert.equal(compareVersion({ sha: '' }, { sha: 'x' }), 'unknown')
  assert.deepEqual(GUIDE.ro.map((s) => s.id), GUIDE.ru.map((s) => s.id))
  for (const l of ['ro', 'ru']) for (const s of GUIDE[l]) assert.deepEqual(s.parts.map((p) => Object.keys(p)[0]), GUIDE.ro.find((x) => x.id === s.id).parts.map((p) => Object.keys(p)[0]))
})

const wdTs = await import('../supabase/functions/_shared/workday.ts').catch((e) => { console.error(e); return null })
test('zile lucrătoare: weekend, sărbători, Paște ortodox; aceeași logică pe server', { skip: !wdTs }, async () => {
  const w = await import('../src/lib/workday.js')
  assert.deepEqual([2025, 2026, 2027].map(w.orthodoxEaster), ['2025-04-20', '2026-04-12', '2027-05-02'])
  assert.equal(w.shiftWorkday('2026-11-07', 'before'), '2026-11-06') // sâmbătă → vineri
  assert.equal(w.shiftWorkday('2026-11-08', 'after'), '2026-11-09')  // duminică → luni
  assert.equal(w.shiftWorkday('2026-12-25', 'before'), '2026-12-24') // Crăciun
  assert.equal(w.shiftWorkday('2026-04-20', 'before'), '2026-04-17') // Paștele Blajinilor (luni) → vinerea dinainte
  assert.equal(w.shiftWorkday('2027-01-08', 'after'), '2027-01-11')  // 7–8 ianuarie, apoi weekend
  assert.equal(w.shiftWorkday('2026-11-07', 'none'), '2026-11-07')
  for (const d of ['2026-01-01', '2026-03-08', '2026-08-27', '2026-11-05', '2027-05-03']) assert.equal(wdTs.isWorkday(d), w.isWorkday(d))
  const fs = await import('node:fs')
  const a = fs.readFileSync(new URL('../src/lib/workday.js', import.meta.url), 'utf8')
  const b = fs.readFileSync(new URL('../supabase/functions/_shared/workday.ts', import.meta.url), 'utf8')
  assert.equal(b.split('\n').slice(1).join('\n'), a)
})

test('P2P (Fagura): rată lunară egală, suma nerambursată ca pe platformă', async () => {
  const { annuityInfo } = await import('../src/lib/invest.js')
  const at = (d) => annuityInfo(25, 21.9, '2026-07-13', '2029-07-13', d)
  assert.equal(at('2026-11-03').pmt, 0.95)
  assert.deepEqual([at('2026-08-14').remaining, at('2026-11-03').remaining, at('2026-11-03').paid, at('2026-11-03').n], [24.51, 23.49, 3, 36])
  assert.equal(at('2026-11-03').next, '2026-11-13')
  assert.equal(at('2026-07-20').remaining, 25)
  assert.equal(at('2029-08-01').remaining <= 0.05, true)
})

test('plățile investițiilor: cupoane, rate P2P, ce e de adăugat', async () => {
  const { payoutSchedule, duePayouts, lastPayoutBefore } = await import('../src/lib/invest.js')
  const p2p = { kind: 'p2p', amount: 25, rate: 21.9, start_date: '2026-07-13', maturity_date: '2029-07-13' }
  const rows = payoutSchedule(p2p)
  assert.equal(rows.length, 36)
  assert.deepEqual(rows[0], { date: '2026-08-13', interest: 0.46, principal: 0.49, balance: 24.51 })
  assert.equal(Math.round(rows.reduce((s, r) => s + r.principal, 0) * 100) / 100, 25)
  assert.equal(lastPayoutBefore(p2p, '2026-11-03'), '2026-10-13')
  assert.deepEqual(duePayouts({ ...p2p, paid_through: '2026-10-13' }, '2026-11-13').map((r) => r.date), ['2026-11-13'])
  assert.deepEqual(duePayouts({ ...p2p, paid_through: '2026-10-13' }, '2026-11-12'), [])
  const bond = { kind: 'gov_bond', amount: 2000, rate: 7.45, start_date: '2026-10-18', maturity_date: '2027-10-06', coupon_freq: 'semiannual' }
  assert.deepEqual(payoutSchedule(bond).map((r) => [r.date, r.principal]), [['2027-04-18', 0], ['2027-10-06', 2000]])
  const tbill = { kind: 'tbill', amount: 10000, rate: 6.9, start_date: '2026-09-23', maturity_date: '2027-03-24', coupon_freq: 'maturity' }
  assert.deepEqual(payoutSchedule(tbill).map((r) => [r.date, r.interest, r.principal]), [['2027-03-24', 344.05, 10000]])
  assert.deepEqual(payoutSchedule({ kind: 'stocks', amount: 5, rate: 3, start_date: '2026-01-01' }), [])
})

test('invest.ts e copia exactă a invest.js', async () => {
  const fs = await import('node:fs')
  const a = fs.readFileSync(new URL('../src/lib/invest.js', import.meta.url), 'utf8')
  const b = fs.readFileSync(new URL('../supabase/functions/_shared/invest.ts', import.meta.url), 'utf8')
  assert.equal(b.split('\n').slice(1).join('\n'), a)
})

test('datorii scrise ca cheltuială/venit: recunoaștere și persoană', async () => {
  const { classifyDebt: c, samePerson } = await import('../src/lib/debtparse.js')
  assert.deepEqual(c('expense', 'datorie octavian'), { type: 'lend', direction: 'owed_to_us', person: 'Octavian' })
  assert.deepEqual(c('income', 'intors datorie danu'), { type: 'repaid', direction: 'owed_to_us', person: 'Danu' })
  assert.deepEqual(c('income', 'împrumut de la mama'), { type: 'borrow', direction: 'we_owe', person: 'Mama' })
  assert.equal(c('expense', 'am întors datoria mamei').type, 'repay')
  assert.equal(c('expense', 'i-am dat împrumut lui Ion').person, 'Ion')
  assert.equal(c('income', 'Саша вернул долг').type, 'repaid')
  for (const s of ['cafea', 'Credit ipotecar', 'Salariu', 'Rata la bancă']) assert.equal(c('expense', s), null)
  assert.ok(samePerson('Mama', 'mamei') && samePerson('Danu', 'danu') && !samePerson('Ana', 'Andrei'))
  const fs = await import('node:fs')
  const a = fs.readFileSync(new URL('../src/lib/debtparse.js', import.meta.url), 'utf8')
  const b = fs.readFileSync(new URL('../supabase/functions/_shared/debtparse.ts', import.meta.url), 'utf8')
  assert.equal(b.split('\n').slice(1).join('\n'), a)
})

test('extras MAIB PDF: antet pe două rânduri, ieșiri/intrări în moneda contului', async () => {
  const { pdfTable } = await import('../src/lib/pdftable.js')
  const { detectColumns, toTransactions } = await import('../src/lib/csv.js')
  const it = (str, x, y, w = str.length * 4.4, h = 8) => ({ str, x, y, w, h, page: 1 })
  const items = [
    it('Data', 25, 30), it('Data', 145, 30), it('Descrierea operațiunii', 285, 36), it('Suma în valuta', 520, 30), it('Suma în valuta contului', 880, 22),
    it('tranzacției', 25, 41), it('procesării', 145, 41), it('tranzacției', 520, 41),
    it('ieșiri', 720, 46), it('intrări', 850, 46), it('comision', 975, 46), it('sold după', 1085, 41), it('tranzacție', 1085, 52),
    it('Tranzacții în procesare', 25, 70), it('#Cardul', 305, 70), it('436151******4429', 400, 70),
    it('2026-11-03', 25, 92), it('www letz md', 285, 93.5), it('-52.35', 585, 92), it('MDL', 645, 92), it('52.35', 780, 92),
    it('2026-11-02', 25, 110), it('Netflix.com', 285, 111), it('-10.99', 585, 110), it('EUR', 645, 110), it('215.30', 775, 110), it('4.30', 1000, 110),
    it('2026-11-01', 25, 128), it('Transfer salariu', 285, 128), it('16500.00', 575, 128), it('MDL', 645, 128), it('16500.00', 860, 128),
  ]
  const t = pdfTable(items)
  assert.equal(t.mode, 'table')
  const cols = detectColumns(t.rows)
  const tx = toTransactions(t.rows, cols)
  assert.deepEqual(tx.map((x) => [x.date, x.kind, x.amount, x.description]), [
    ['2026-11-03', 'expense', 52.35, 'www letz md'],
    ['2026-11-02', 'expense', 219.6, 'Netflix.com'], // 215,30 MDL + 4,30 comision, în moneda contului
    ['2026-11-01', 'income', 16500, 'Transfer salariu'],
  ])
})

test('dorință cumpărată: găsește cheltuiala deja făcută', async () => {
  const { wishCandidates } = await import('../src/lib/wishmatch.js')
  const txs = [
    { id: 1, kind: 'expense', date: '2026-11-03', mdl: 8990, merchant: 'Bomba', note: 'mașină de spălat vase Bosch' },
    { id: 2, kind: 'expense', date: '2026-11-04', mdl: 120, merchant: 'Linella' },
    { id: 3, kind: 'expense', date: '2026-11-02', mdl: 9000, merchant: 'Enter' },
    { id: 4, kind: 'income', date: '2026-11-03', mdl: 9000, merchant: 'Salariu' },
    { id: 5, kind: 'expense', date: '2026-03-01', mdl: 9000, merchant: 'Vechi' },
  ]
  const r = wishCandidates({ title: 'Mașină de spălat vase', priceMdl: 9000, created_at: '2026-10-20' }, txs, '2026-11-05')
  assert.deepEqual(r.slice(0, 2).map((c) => c.tx.id), [1, 3])
  assert.ok(!r.some((c) => c.tx.id === 4 || c.tx.id === 5))
  assert.deepEqual(wishCandidates({ title: 'x', priceMdl: 0 }, txs, '2026-11-05', { query: 'linel' }).map((c) => c.tx.id), [2])
})

test('RON: curs BNM, botul, Apple Pay', async () => {
  const { parseBnmXml } = await import('../supabase/functions/_shared/bnm.ts')
  const xml = '<ValCurs><Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>19.4521</Value></Valute><Valute><CharCode>RON</CharCode><Nominal>1</Nominal><Value>3.9112</Value></Valute><Valute><CharCode>UAH</CharCode><Nominal>1</Nominal><Value>0.42</Value></Valute></ValCurs>'
  assert.deepEqual(parseBnmXml(xml), { EUR: 19.4521, RON: 3.9112 })
  const q = await import('../supabase/functions/_shared/quick.ts')
  assert.equal(q.parseQuick('benzina 250 ron').currency, 'RON')
  assert.equal(q.parseQuick('cafea 45 lei').currency, 'MDL')
  const w = await import('../supabase/functions/_shared/wallet.ts')
  assert.deepEqual(w.parseWalletAmount('12,30 RON'), { amount: 12.3, currency: 'RON' })
})

const relTs = await import('../supabase/functions/_shared/release.ts').catch((e) => { console.error(e); return null })
test('anunțul versiunii noi: doar schimbările de după ultimul anunț', { skip: !relTs }, () => {
  const { newCommits, releaseText } = relTs
  const list = [{ sha: 'c3', title: 'Moneda RON' }, { sha: 'c2', title: 'Publicare: CLI fixat' }, { sha: 'c1', title: 'Lista de dorințe' }, { sha: 'c0', title: 'Vechi' }]
  assert.deepEqual(newCommits(list, 'c1').map((c) => c.sha), ['c3'])
  assert.deepEqual(newCommits(list, 'c3'), [])
  assert.deepEqual(newCommits(list, null).map((c) => c.sha), ['c3', 'c1', 'c0'])
  const t = releaseText([{ sha: 'c3', title: 'Moneda RON: conturi' }], 'ro')
  assert.match(t, /^🆕 Aplicația s-a actualizat\. Ce e nou:\n• Moneda RON: conturi\n/)
})

const al2 = await import('../supabase/functions/_shared/alerts2.ts').catch((e) => { console.error(e); return null })
test('alerte: peste obișnuit, sold mic, suma scrisă de om', { skip: !al2 }, () => {
  const { paceAlerts, lowBalance, parseMoney } = al2
  const r = paceAlerts({ food: 7600, car: 900, fun: 50 }, { food: [7400, 7500, 7450], car: [3000, 2800, 0], fun: [100, 0, 0] }, 14, 30)
  assert.deepEqual(r.map((x) => [x.cat, Math.round(x.usual), x.daysLeft]), [['food', 7450, 16]])
  assert.deepEqual(paceAlerts({ food: 9000 }, { food: [7400, 7500] }, 27, 30), [])
  const lb = lowBalance([{ name: 'Rata', amount: 6367, accountId: 'a' }, { name: 'Internet', amount: 250, accountId: 'b' }], { a: 4200, b: 900 })
  assert.deepEqual(lb, [{ accountId: 'a', total: 6367, names: ['Rata'], balance: 4200 }])
  assert.deepEqual(['1 230', '1230.5', '1.230,50', '1,230.50', 'abc', '12,3'].map(parseMoney), [1230, 1230.5, 1230.5, 1230.5, null, 12.3])
})

test('împărțirea salariului', async () => {
  const { salaryPlan, isSalaryTx } = await import('../src/lib/salary.js')
  const p = salaryPlan(18806, [{ date: '2026-11-24', name: 'Credit', amount: 6367 }, { date: '2026-11-15', name: 'Gaz', amount: 1800 }], 10, 27)
  assert.deepEqual([p.bills, p.save, p.rest, p.perDay, p.list[0].name], [8167, 1881, 8758, 324, 'Gaz'])
  assert.equal(salaryPlan(5000, [{ date: 'x', name: 'Rata', amount: 6000 }], 10, 30).short, 1500)
  assert.ok(isSalaryTx({ kind: 'income', amount: 18806, merchant: 'Salariu' }))
  assert.ok(isSalaryTx({ kind: 'income', amount: 9000 }, 'wallet'))
  assert.ok(!isSalaryTx({ kind: 'income', amount: 500, merchant: 'Salariu' }))
  assert.ok(!isSalaryTx({ kind: 'income', amount: 5000, merchant: 'intors datorie' }))
  const fs = await import('node:fs')
  const a = fs.readFileSync(new URL('../src/lib/salary.js', import.meta.url), 'utf8')
  const b = fs.readFileSync(new URL('../supabase/functions/_shared/salary.ts', import.meta.url), 'utf8')
  assert.equal(b.split('\n').slice(1).join('\n'), a)
})

const icalTs = await import('../supabase/functions/_shared/ical.ts').catch((e) => { console.error(e); return null })
test('calendarul .ics: evenimente pe zi întreagă, anual, rânduri scurte', { skip: !icalTs }, () => {
  const { buildIcs } = icalTs
  const s = buildIcs('Banii familiei', [
    { uid: 'loan-1-3', date: '2026-11-24', title: '💳 Credit ipotecar — 6 366,97 MDL', note: 'Rata: rata 3', alarm: true },
    { uid: 'event-9', date: '1962-11-14', title: '🎂 Mama (🎁 800 MDL), cu virgulă; și punct și virgulă', yearly: true },
  ], '20261108T120000Z')
  assert.match(s, /^BEGIN:VCALENDAR\r\n/)
  assert.match(s, /DTSTART;VALUE=DATE:20261124\r\nDTEND;VALUE=DATE:20261125/)
  assert.match(s, /RRULE:FREQ=YEARLY/)
  assert.match(s, /TRIGGER:-PT15H/)
  assert.ok(s.includes('\\, cu virgulă\;') || s.replace(/\r\n /g, '').includes('\\, cu virgulă\;'))
  for (const line of s.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line)
  assert.ok(s.endsWith('END:VCALENDAR\r\n'))
})
