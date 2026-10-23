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
