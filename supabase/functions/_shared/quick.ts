// Înțelege mesaje scurte trimise botului:
//   "cafea 45"            → cheltuială 45 MDL, Distracție
//   "benzină 900 cash"    → cheltuială 900 MDL din cash, Mașină (alimentare)
//   "+salariu 14200"      → venit 14 200 MDL
//   "linella 385,50 maib" → cheltuială pe cardul MAIB
//   "20€ revolut netflix" → cheltuială 20 EUR pe Revolut
import { type Acc, guessCategoryIcon, matchAccount } from "./wallet.ts";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const WORDS: [RegExp, string][] = [
  [/^(benzin|motorin|carburant|gaz auto|alimentare|plin|бензин|дизел|заправк|солярк)/, "car"],
  [/^(masin|auto|service|vulcaniz|spalat|parcare|rca|casco|amend|машин|сервис|шиномонтаж|мойк|парковк|штраф|такси)/, "car"],
  [/^(produse|aliment|piat|paine|lapte|carne|legum|fruct|supermarket|magazin|cumparatur|продукт|хлеб|молок|мясо|овощ|фрукт|рынок|магазин|супермаркет)/, "cart"],
  [/^(cafea|cafe|restaurant|pizza|burger|shaorm|cinema|film|bar|bere|vin|livrare|glovo|distract|cadou|кофе|кафе|ресторан|пицц|кино|бар|пиво|вино|доставк|подар)/, "ticket"],
  [/^(farmac|medicament|pastil|doctor|medic|analiz|stomat|dentist|sanatate|spital|аптек|лекарств|врач|доктор|анализ|стоматолог|больниц)/, "heart"],
  [/^(haine|incaltaminte|pantofi|geaca|tricou|blug|одежд|обувь|куртк|джинс|футболк)/, "shirt"],
  [/^(gradinit|scoal|rechizit|jucari|copil|cerc|dans|inot|pamper|scutec|lectii|садик|детсад|школ|игрушк|кружок|памперс|подгузник)/, "school"],
  [/^(chirie|reparat|mobil|casa|curatenie|detergent|ikea|bricolaj|аренд|ремонт|мебел|уборк)/, "home"],
  [/^(lumin|curent|energie|gaz|apa|internet|telefon|abonament|utilit|intretinere|свет|электр|газ|вода|интернет|телефон|коммунал|квартплат)/, "bolt"],
  [/^(rata|credit|banca|кредит|ипотек|банк)/, "bank"],
];
const INCOME = /^(salariu|venit|primit|bonus|avans|alocat|dobanda|cashback|rambursare|зарплат|доход|получил|аванс|преми|кешбэк|кэшбэк)/;
const CASH = /^(cash|numerar|portofel|bani gheata|lei cash|наличные|наличными|нал|кеш|кэш)$/;

export type Quick = {
  kind: "expense" | "income";
  amount: number;
  currency: string;
  description: string | null;
  categoryIcon: string | null;
  isFuel: boolean;
  cash: boolean;
  accountWord: string | null;
  tags: string[];
};

export function parseQuick(input: string): Quick | null {
  let text = String(input ?? "").trim();
  if (!text || text.startsWith("/")) return null;
  // Etichete: „benzină 900 #vacanță” → tags ["vacanță"]
  const tags = [...new Set([...text.matchAll(/#([\p{L}\p{N}_-]{1,24})/gu)].map((x) => x[1].toLowerCase()))].slice(0, 8);
  text = text.replace(/#[\p{L}\p{N}_-]+/gu, " ").replace(/\s+/g, " ").trim();
  let kind: "expense" | "income" = "expense";
  if (/^\+/.test(text)) { kind = "income"; text = text.slice(1).trim(); }
  if (/^-/.test(text)) text = text.slice(1).trim();

  // „card 1111” / „cardul *1111”: ultimele cifre ale cardului, nu suma
  let cardDigits: string | null = null;
  text = text.replace(/(?:^|\s)(?:de pe |pe |с |по )?(?:card(?:ul)?|карт[аыуе]|карточк[аиу])\s*\*?(\d{4})(?=\s|$)/i, (_m, d) => { cardDigits = d; return " "; }).replace(/\s+/g, " ").trim();
  // Suma: primul număr (cu zecimale și spații de mii), cu monedă lipită sau separată
  const m = text.match(/(?:^|\s)(€|\$)?\s*(\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(€|\$|eur|euro|usd|dolari?|mdl|lei|l)?(?=\s|$|[.,!])/i);
  if (!m) return null;
  const amount = Math.round(parseFloat(m[2].replace(/[  ]/g, "").replace(",", ".")) * 100) / 100;
  if (!(amount > 0) || amount > 10_000_000) return null;
  const cur = norm((m[1] || m[3] || "").trim());
  const currency = cur === "€" || cur.startsWith("eur") ? "EUR" : cur === "$" || cur.startsWith("usd") || cur.startsWith("dolar") ? "USD" : "MDL";

  const rest = (text.slice(0, m.index) + " " + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim();
  const words = rest.split(" ").filter(Boolean);
  let cash = false, categoryIcon: string | null = null, isFuel = false;
  const descWords: string[] = [];
  const accountWords: string[] = [];
  for (const w of words) {
    const n = norm(w).replace(/[^\p{L}\p{N}]/gu, "");
    if (!n) continue;
    if (CASH.test(n)) { cash = true; continue; }
    if (/^(card|cardul|pe)$/.test(n)) continue;
    if (kind === "expense" && INCOME.test(n) && !descWords.length) kind = "income";
    if (!categoryIcon) for (const [re, icon] of WORDS) if (re.test(n)) { categoryIcon = icon; if (/^(benzin|motorin|carburant|alimentare|plin|бензин|дизел|заправк|солярк)/.test(n)) isFuel = true; break; }
    descWords.push(w);
    accountWords.push(n);
  }
  if (cardDigits) accountWords.push(cardDigits);
  if (!categoryIcon && kind === "expense") categoryIcon = guessCategoryIcon(descWords.join(" "));
  if (categoryIcon === "car" && !isFuel && /lukoil|petrom|rompetrol|bemol|tirex|avante/.test(norm(descWords.join(" ")))) isFuel = true;
  const description = descWords.join(" ").replace(/^./, (c) => c.toUpperCase()) || null;
  return { kind, amount, currency, description, categoryIcon, isFuel, cash, accountWord: accountWords.join(" ") || null, tags };
}

// Contul: cash dacă s-a scris „cash”; altfel un card numit în mesaj; altfel primul card al persoanei
export function pickAccount(q: Quick, accounts: Acc[], memberId?: string | null): Acc | null {
  const list = accounts.filter((a) => !a.archived && a.type !== "asset");
  if (q.cash) {
    return list.find((a) => a.type === "cash" && a.currency === q.currency) ?? list.find((a) => a.type === "cash") ?? null;
  }
  if (q.accountWord) {
    const words = q.accountWord.split(" ");
    // „de pe card 1111”: ultimele 4 cifre ale cardului
    const byLast4 = list.find((a) => a.last4 && words.includes(String(a.last4)));
    if (byLast4) return byLast4;
    const hit = list.find((a) => {
      const names = [a.name, a.bank, a.wallet_alias].filter(Boolean).map((x) => norm(String(x)));
      return names.some((nm) => words.some((w) => w.length >= 3 && (nm.split(/\s+/).includes(w) || nm === w)));
    });
    if (hit) return hit;
  }
  return matchAccount("", q.currency, list, memberId).account ?? list[0] ?? null;
}

// ── Alegerea contului din mesajul botului ──
// Conturile cu bani (fără bunuri și arhivate), în ordinea din aplicație; indexul din buton trimite la ele.
export function accountChoices<T extends Acc & { sort?: number | null; type: string }>(accounts: T[]): T[] {
  return accounts.filter((a) => !a.archived && a.type !== "asset")
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 12);
}

// Suma mutată pe un cont în altă monedă (cursul BNM: câți MDL face 1 unitate)
export function convertAmount(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount;
  const a = rates[from] ?? (from === "MDL" ? 1 : NaN), b = rates[to] ?? (to === "MDL" ? 1 : NaN);
  if (!(a > 0) || !(b > 0)) return amount;
  return Math.round(((amount * a) / b) * 100) / 100;
}

// Tastatura: conturile câte două pe rând (✓ la cel ales), apoi Modifică / Anulează
// `currency`: doar conturile în moneda asta (la datorii); numărul din buton rămâne poziția în lista completă
export function accountKeyboard(txId: string, accounts: { id: string; name: string; currency: string; type: string }[], currentId: string, ru: boolean, appUrl: string, currency?: string) {
  const icon = (a: { type: string }) => (a.type === "cash" ? "💵" : a.type === "deposit" ? "🏦" : a.type === "invest" ? "📈" : "💳");
  const btn = accounts.map((a, i) => ({ a, i })).filter(({ a }) => !currency || a.currency === currency).map(({ a, i }) => ({
    text: `${a.id === currentId ? "✓ " : icon(a) + " "}${a.name}${a.currency !== "MDL" ? " · " + a.currency : ""}`.slice(0, 40),
    callback_data: `acc:${txId}:${i}`,
  }));
  const rows: { text: string; callback_data?: string; web_app?: { url: string } }[][] = [];
  for (let i = 0; i < btn.length; i += 2) rows.push(btn.slice(i, i + 2));
  rows.push([
    { text: ru ? "Изменить" : "Modifică", web_app: { url: `${appUrl}?tx=${txId}` } },
    { text: ru ? "Отменить" : "Anulează", callback_data: `del:${txId}` },
  ]);
  return { inline_keyboard: rows };
}
