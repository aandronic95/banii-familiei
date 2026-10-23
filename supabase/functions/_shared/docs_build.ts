// Construiește raportul PDF și exportul Excel (fără acces la bază; primește datele gata încărcate)
// deno-lint-ignore-file no-explicit-any
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import * as XLSX from "npm:xlsx@0.18.5";

const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());

// ───────── Texte ─────────
const MONTHS = {
  ro: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
  ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
};
export const L = {
  ro: { report: "Raport lunar", income: "Venituri", expense: "Cheltuieli", saved: "Economisit", byCat: "Cheltuieli pe categorii", byPerson: "Pe persoană",
    budgets: "Bugete", top: "Cele mai mari cheltuieli", accounts: "Conturi", net: "Avere netă", assets: "Conturi", invest: "Investiții", debts: "Credite", owed: "Datorii personale (net)",
    none: "fără categorie", common: "Comun", vsPrev: "față de luna trecută", over: "depășit", generated: "Generat", caption: (m: string) => `📊 Raportul pentru ${m}`, exportCap: "📦 Toate datele familiei (Excel)" },
  ru: { report: "Месячный отчёт", income: "Доходы", expense: "Расходы", saved: "Сэкономлено", byCat: "Расходы по категориям", byPerson: "По людям",
    budgets: "Бюджеты", top: "Самые крупные расходы", accounts: "Счета", net: "Чистые активы", assets: "Счета", invest: "Инвестиции", debts: "Кредиты", owed: "Личные долги (нетто)",
    none: "без категории", common: "Общий", vsPrev: "к прошлому месяцу", over: "превышен", generated: "Создано", caption: (m: string) => `📊 Отчёт за ${m}`, exportCap: "📦 Все данные семьи (Excel)" },
};
const fmt = (n: number, d = 0) => (n < 0 ? "−" : "") + Math.abs(n).toFixed(d).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// ───────── PDF ─────────
let fontCache: { reg: Uint8Array; bold: Uint8Array } | null = null;
// Noto Sans (diacritice + chirilice); dacă CDN-ul nu răspunde, DejaVu Sans de pe unpkg
const FONT_SOURCES = [
  ["https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf", "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf"],
  ["https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf", "https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf"],
];
export function setFonts(reg: Uint8Array, bold: Uint8Array) { fontCache = { reg, bold }; }
async function fonts() {
  if (fontCache) return fontCache;
  for (const [r, b] of FONT_SOURCES) {
    try {
      const [reg, bold] = await Promise.all([r, b].map(async (u) => { const res = await fetch(u); if (!res.ok) throw new Error(u); return new Uint8Array(await res.arrayBuffer()); }));
      fontCache = { reg, bold };
      return fontCache;
    } catch (_) { /* următoarea sursă */ }
  }
  throw new Error("fonts");
}

const C = { ink: rgb(0.078, 0.125, 0.102), muted: rgb(0.349, 0.392, 0.369), brand: rgb(0.051, 0.416, 0.306), soft: rgb(0.863, 0.937, 0.902),
  line: rgb(0.867, 0.882, 0.859), income: rgb(0.086, 0.467, 0.29), expense: rgb(0.557, 0.18, 0.122), warn: rgb(0.588, 0.357, 0), bg: rgb(0.953, 0.957, 0.945) };

export async function buildReport(F: any, month: string, lang: "ro" | "ru") {
  const T = L[lang];
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`, to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const prevD = new Date(Date.UTC(y, m - 2, 1)); const pm = prevD.toISOString().slice(0, 7);
  const pFrom = `${pm}-01`, pTo = `${pm}-${String(new Date(Date.UTC(prevD.getUTCFullYear(), prevD.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0")}`;
  const sums = (a: string, b: string) => {
    let inc = 0, exp = 0; const byCat: Record<string, number> = {}, byMem: Record<string, number> = {}; const list: any[] = [];
    for (const t of F.transactions) {
      if (t.date < a || t.date > b || (t.kind !== "income" && t.kind !== "expense")) continue;
      const v = F.toMdl(t.amount, F.txCur(t));
      if (t.kind === "income") inc += v;
      else { exp += v; byCat[t.category_id ?? "-"] = (byCat[t.category_id ?? "-"] ?? 0) + v; byMem[t.member_id ?? "-"] = (byMem[t.member_id ?? "-"] ?? 0) + v; list.push({ ...t, v }); }
    }
    return { inc, exp, byCat, byMem, list };
  };
  const cur = sums(from, to), prev = sums(pFrom, pTo);
  const catName = (id: string) => (F.catById[id] ? (lang === "ru" ? F.catById[id].name_ru : F.catById[id].name_ro) : T.none);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const f = await fonts();
  const reg = await pdf.embedFont(f.reg, { subset: true });
  const bold = await pdf.embedFont(f.bold, { subset: true });
  const W = 595.28, H = 841.89, M = 44;
  let page = pdf.addPage([W, H]);
  let yy = H - M;
  const text = (s: string, x: number, size = 10, font = reg, color = C.ink) => page.drawText(s, { x, y: yy, size, font, color });
  const right = (s: string, xr: number, size = 10, font = reg, color = C.ink) => page.drawText(s, { x: xr - font.widthOfTextAtSize(s, size), y: yy, size, font, color });
  const need = (h: number) => { if (yy - h < M) { page = pdf.addPage([W, H]); yy = H - M; } };
  const section = (title: string) => { need(40); yy -= 26; text(title, M, 13, bold); yy -= 8; page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.8, color: C.line }); yy -= 16; };
  const fit = (s: string, max: number, size = 10, font = reg) => { let o = String(s ?? ""); while (o.length > 1 && font.widthOfTextAtSize(o, size) > max) o = o.slice(0, -2) + "…"; return o; };

  // Antet
  page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: C.brand });
  yy = H - 58; text(`${T.report}`, M, 12, reg, rgb(0.86, 0.94, 0.9));
  yy -= 30; text(`${MONTHS[lang][m - 1][0].toUpperCase() + MONTHS[lang][m - 1].slice(1)} ${y}`, M, 26, bold, rgb(1, 1, 1));
  right(F.family?.name ?? "", W - M, 11, reg, rgb(0.86, 0.94, 0.9));
  yy = H - 150;

  // Rezumat: 3 casete
  const boxW = (W - 2 * M - 24) / 3;
  const saved = cur.inc - cur.exp;
  const boxes: [string, number, any][] = [[T.income, cur.inc, C.income], [T.expense, cur.exp, C.expense], [T.saved, saved, saved >= 0 ? C.income : C.expense]];
  boxes.forEach(([label, v, color], i) => {
    const x = M + i * (boxW + 12);
    page.drawRectangle({ x, y: yy - 52, width: boxW, height: 64, color: C.bg });
    page.drawText(label, { x: x + 12, y: yy - 6, size: 9, font: reg, color: C.muted });
    page.drawText(`${fmt(v)} MDL`, { x: x + 12, y: yy - 30, size: 16, font: bold, color });
    const pv = i === 0 ? prev.inc : i === 1 ? prev.exp : prev.inc - prev.exp;
    if (pv) { const d = v - pv; page.drawText(`${d >= 0 ? "+" : "−"}${fmt(Math.abs(d))} ${T.vsPrev}`, { x: x + 12, y: yy - 46, size: 7.5, font: reg, color: C.muted }); }
  });
  yy -= 70;

  // Pe categorii, cu bare
  section(T.byCat);
  const cats = Object.entries(cur.byCat).sort((a, b) => b[1] - a[1]);
  const maxC = cats[0]?.[1] || 1;
  for (const [id, v] of cats) {
    need(22);
    text(fit(catName(id), 150), M, 10);
    page.drawRectangle({ x: M + 160, y: yy - 1, width: 220, height: 8, color: C.bg });
    page.drawRectangle({ x: M + 160, y: yy - 1, width: Math.max(2, 220 * (v / maxC)), height: 8, color: C.brand });
    right(`${fmt(v)} MDL`, W - M - 44, 10, bold);
    right(`${Math.round((v / (cur.exp || 1)) * 100)}%`, W - M, 9, reg, C.muted);
    yy -= 20;
  }

  // Bugete
  const budgets = F.categories.filter((c: any) => c.kind === "expense" && c.budget && !c.archived);
  if (budgets.length) {
    section(T.budgets);
    for (const c of budgets) {
      need(20);
      const spent = cur.byCat[c.id] ?? 0, b = Number(c.budget), pct = spent / b;
      text(fit(lang === "ru" ? c.name_ru : c.name_ro, 150), M, 10);
      const label = `${fmt(spent)} / ${fmt(b)}${pct > 1 ? " · " + T.over : ""}`;
      const lf = pct > 1 ? bold : reg;
      const barW = Math.max(60, Math.min(220, W - M - lf.widthOfTextAtSize(label, 9.5) - 14 - (M + 160)));
      page.drawRectangle({ x: M + 160, y: yy - 1, width: barW, height: 8, color: C.bg });
      page.drawRectangle({ x: M + 160, y: yy - 1, width: Math.max(2, barW * Math.min(1, pct)), height: 8, color: pct > 1 ? C.expense : pct >= 0.8 ? C.warn : C.brand });
      right(label, W - M, 9.5, lf, pct > 1 ? C.expense : C.ink);
      yy -= 20;
    }
  }

  // Pe persoană
  section(T.byPerson);
  for (const [id, v] of Object.entries(cur.byMem).sort((a, b) => b[1] - a[1])) {
    need(18);
    text(F.memById[id]?.name ?? T.common, M, 10);
    right(`${fmt(v)} MDL · ${Math.round((v / (cur.exp || 1)) * 100)}%`, W - M, 10);
    yy -= 18;
  }

  // Top cheltuieli
  section(T.top);
  for (const t of cur.list.sort((a, b) => b.v - a.v).slice(0, 10)) {
    need(18);
    const d = t.date.split("-").reverse().slice(0, 2).join(".");
    text(d, M, 9.5, reg, C.muted);
    text(fit(t.merchant || catName(t.category_id), 250), M + 44, 10);
    text(fit(catName(t.category_id), 110, 9), M + 310, 9, reg, C.muted);
    right(`${fmt(Number(t.amount), 2)} ${F.txCur(t)}`, W - M, 10, bold);
    yy -= 18;
  }

  // Conturi și avere netă
  section(T.net);
  let assets = 0;
  for (const a of F.accounts.filter((a: any) => !a.archived)) {
    need(16);
    const b = F.balances[a.id] ?? 0; assets += F.toMdl(b, a.currency);
    text(fit(a.name, 300), M, 10); right(`${fmt(b, 2)} ${a.currency}`, W - M, 10); yy -= 16;
  }
  const inv = F.investments.filter((i: any) => i.status !== "closed").reduce((s: number, i: any) => s + F.toMdl(i.current_value ?? i.amount, i.currency), 0);
  const loans = F.loans.filter((l: any) => !l.closed).reduce((s: number, l: any) => s + F.toMdl(F.loanLeft(l), l.currency), 0);
  const owed = F.debts.filter((d: any) => !d.settled).reduce((s: number, d: any) => s + F.toMdl((Number(d.amount) - Number(d.paid)) * (d.direction === "owed_to_us" ? 1 : -1), d.currency), 0);
  yy -= 6; need(80);
  for (const [label, v] of [[T.assets, assets], [T.invest, inv], [T.debts, -loans], [T.owed, owed]] as [string, number][]) {
    if (!v) continue;
    text(label, M, 10, reg, C.muted); right(`${fmt(v)} MDL`, W - M, 10); yy -= 16;
  }
  page.drawLine({ start: { x: M, y: yy + 10 }, end: { x: W - M, y: yy + 10 }, thickness: 0.6, color: C.line });
  yy -= 4; text(T.net, M, 12, bold); right(`${fmt(assets + inv - loans + owed)} MDL`, W - M, 12, bold);

  // Subsol pe fiecare pagină
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Banii Familiei · ${T.generated} ${todayLocal().split("-").reverse().join(".")} · ${i + 1}/${pages.length}`, { x: M, y: 24, size: 8, font: reg, color: C.muted }));
  return { bytes: await pdf.save(), name: `raport-${month}.pdf`, monthLabel: `${MONTHS[lang][m - 1]} ${y}` };
}

// ───────── Excel ─────────
export function buildExport(F: any, lang: "ro" | "ru", opts: { onlyTx?: boolean } = {}) {
  const ro = lang !== "ru";
  const cat = (id: string) => (F.catById[id] ? (ro ? F.catById[id].name_ro : F.catById[id].name_ru) : "");
  const mem = (id: string) => F.memById[id]?.name ?? "";
  const acc = (id: string) => F.accById[id]?.name ?? "";
  const KIND: Record<string, string> = ro
    ? { expense: "Cheltuială", income: "Venit", transfer: "Transfer", invest: "Spre investiție", divest: "Din investiție" }
    : { expense: "Расход", income: "Доход", transfer: "Перевод", invest: "В инвестицию", divest: "Из инвестиции" };
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: any[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    const keys = Object.keys(rows[0] ?? {});
    ws["!cols"] = keys.map((k) => ({ wch: Math.min(40, Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add(ro ? "Tranzacții" : "Операции", [...F.transactions].sort((a: any, b: any) => b.date.localeCompare(a.date)).map((t: any) => ({
    [ro ? "Data" : "Дата"]: t.date, [ro ? "Tip" : "Тип"]: KIND[t.kind] ?? t.kind, [ro ? "Suma" : "Сумма"]: Number(t.amount) * (t.kind === "income" || t.kind === "divest" ? 1 : -1),
    [ro ? "Moneda" : "Валюта"]: F.txCur(t), [ro ? "Cont" : "Счёт"]: acc(t.account_id), [ro ? "În contul" : "На счёт"]: acc(t.to_account_id),
    [ro ? "Categorie" : "Категория"]: cat(t.category_id), [ro ? "Cine" : "Кто"]: mem(t.member_id), [ro ? "Magazin / descriere" : "Магазин / описание"]: t.merchant ?? "",
    [ro ? "Notă" : "Заметка"]: t.note ?? "", [ro ? "Litri" : "Литры"]: t.fuel_liters ?? "", [ro ? "Km" : "Км"]: t.odometer ?? "",
    [ro ? "Etichete" : "Метки"]: (t.tags ?? []).map((x: string) => "#" + x).join(" "),
    ID: t.id, // pentru restaurare: rândurile cu același ID nu se dublează
  })));
  if (opts.onlyTx) {
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return { bytes: new Uint8Array(out), name: `tranzactii-${todayLocal()}.xlsx` };
  }
  add(ro ? "Conturi" : "Счета", F.accounts.map((a: any) => ({ [ro ? "Nume" : "Название"]: a.name, [ro ? "Tip" : "Тип"]: a.type, [ro ? "Moneda" : "Валюта"]: a.currency, [ro ? "Sold" : "Остаток"]: Math.round((F.balances[a.id] ?? 0) * 100) / 100, [ro ? "Al cui" : "Чей"]: mem(a.member_id), [ro ? "Banca" : "Банк"]: a.bank ?? "", [ro ? "Arhivat" : "Архив"]: a.archived ? "da" : "" })));
  add(ro ? "Credite" : "Кредиты", F.loans.map((l: any) => ({ [ro ? "Nume" : "Название"]: l.name, [ro ? "Banca" : "Банк"]: l.bank ?? "", [ro ? "Suma" : "Сумма"]: Number(l.principal), [ro ? "Dobândă %" : "Ставка %"]: Number(l.annual_rate), [ro ? "Luni" : "Мес."]: l.term_months, [ro ? "Prima rată" : "Первый платёж"]: l.first_due, [ro ? "Rămas" : "Остаток"]: Math.round(F.loanLeft(l)), [ro ? "Moneda" : "Валюта"]: l.currency })));
  add(ro ? "Investiții" : "Инвестиции", F.investments.map((i: any) => ({ [ro ? "Platforma" : "Платформа"]: i.platform ?? "", [ro ? "Denumire" : "Название"]: i.name, [ro ? "Cod" : "Код"]: i.code ?? "", [ro ? "Investit" : "Вложено"]: Number(i.amount), [ro ? "Moneda" : "Валюта"]: i.currency, [ro ? "Dobândă %" : "Ставка %"]: i.rate ?? "", [ro ? "Început" : "Начало"]: i.start_date, [ro ? "Scadență" : "Погашение"]: i.maturity_date ?? "", [ro ? "Valoare actuală" : "Текущая стоимость"]: i.current_value ?? "", [ro ? "Statut" : "Статус"]: i.status })));
  add(ro ? "Datorii" : "Долги", F.debts.map((d: any) => ({ [ro ? "Direcție" : "Направление"]: d.direction === "owed_to_us" ? (ro ? "Ne datorează" : "Должны нам") : (ro ? "Datorăm" : "Должны мы"), [ro ? "Persoana" : "Человек"]: d.person, [ro ? "Suma" : "Сумма"]: Number(d.amount), [ro ? "Întors" : "Возвращено"]: Number(d.paid), [ro ? "Moneda" : "Валюта"]: d.currency, [ro ? "Data" : "Дата"]: d.date, [ro ? "Termen" : "Срок"]: d.due_date ?? "", [ro ? "Achitată" : "Погашен"]: d.settled ? "da" : "" })));
  add(ro ? "Obiective" : "Цели", F.goals.map((g: any) => ({ [ro ? "Obiectiv" : "Цель"]: g.name, [ro ? "Țintă" : "Цель, сумма"]: Number(g.target), [ro ? "Strâns" : "Накоплено"]: g.account_id ? Math.round(F.balances[g.account_id] ?? 0) : Number(g.saved), [ro ? "Moneda" : "Валюта"]: g.currency, [ro ? "Până la" : "К дате"]: g.deadline ?? "" })));
  add(ro ? "Plăți recurente" : "Регулярные", F.recurring.map((r: any) => ({ [ro ? "Nume" : "Название"]: r.name, [ro ? "Tip" : "Тип"]: KIND[r.kind], [ro ? "Suma" : "Сумма"]: Number(r.amount), [ro ? "La câte luni" : "Раз в мес."]: r.every_months, [ro ? "Ziua" : "День"]: r.day_of_month, [ro ? "Următoarea" : "Следующий"]: r.next_date, [ro ? "Cont" : "Счёт"]: acc(r.account_id), [ro ? "Categorie" : "Категория"]: cat(r.category_id), [ro ? "Activă" : "Активен"]: r.active ? "da" : "" })));
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { bytes: new Uint8Array(out), name: `banii-familiei-${todayLocal()}.xlsx` };
}

