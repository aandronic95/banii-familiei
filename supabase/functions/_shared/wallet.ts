// Logică pură pentru plățile venite din Apple Wallet (testată în tests/core.test.mjs)

// Suma vine din Scurtături ca text, în formatul telefonului:
// "385,50 MDL", "MDL 385.50", "€12,30", "$1,234.56", "1 234,56 lei", "12.30"
export function parseWalletAmount(input: unknown, fallbackCurrency = "MDL"): { amount: number; currency: string } | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const up = raw.toUpperCase();
  let currency = fallbackCurrency;
  if (/€|EUR/.test(up)) currency = "EUR";
  else if (/\$|USD/.test(up)) currency = "USD";
  else if (/MDL|LEI|\bL\b/.test(up)) currency = "MDL";

  let num = raw.replace(/[^\d.,\s  '-]/g, "").replace(/[\s  ']/g, "");
  num = num.replace(/^-/, "");
  if (!num || !/\d/.test(num)) return null;
  const lastDot = num.lastIndexOf("."), lastComma = num.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // separatorul de zecimale e cel care apare ultimul
    num = lastComma > lastDot ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "12,30" → zecimale; "1,234" (3 cifre după, fără alte zecimale) → mii
    num = /,\d{3}$/.test(num) && num.split(",").length > 2 ? num.replace(/,/g, "") : num.replace(",", ".");
  } else if ((num.match(/\./g) || []).length > 1) {
    num = num.replace(/\./g, "");
  }
  const amount = Math.round(parseFloat(num) * 100) / 100;
  if (!isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return { amount, currency };
}

export type Acc = { id: string; name: string; type: string; currency: string; bank?: string | null; last4?: string | null; wallet_alias?: string | null; member_id?: string | null; archived?: boolean };

const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Alege contul după numele cardului din Wallet: alias → ultimele 4 cifre → nume → bancă
export function matchAccount(card: unknown, currency: string, accounts: Acc[], memberId?: string | null): { account: Acc | null; sure: boolean } {
  const list = accounts.filter((a) => !a.archived && a.type !== "asset");
  const c = norm(card);
  const digits = String(card ?? "").match(/\d{4}(?!.*\d{4})/)?.[0];
  const pick = (f: (a: Acc) => boolean) => {
    const found = list.filter(f);
    return found.find((a) => a.currency === currency) ?? found[0] ?? null;
  };
  if (c) {
    const byAlias = pick((a) => !!a.wallet_alias && (norm(a.wallet_alias) === c || c.includes(norm(a.wallet_alias))));
    if (byAlias) return { account: byAlias, sure: true };
    if (digits) {
      const byDigits = pick((a) => a.last4 === digits);
      if (byDigits) return { account: byDigits, sure: true };
    }
    const byName = pick((a) => norm(a.name).length > 2 && (c.includes(norm(a.name)) || norm(a.name).includes(c)));
    if (byName) return { account: byName, sure: true };
    const byBank = pick((a) => a.type === "card" && !!a.bank && norm(a.bank).length > 2 && c.includes(norm(a.bank)));
    if (byBank) return { account: byBank, sure: false };
  }
  // Nu știm cardul: primul card al persoanei, în moneda plății
  const fallback = pick((a) => a.type === "card" && (!memberId || a.member_id === memberId)) ?? pick((a) => a.type === "card");
  return { account: fallback, sure: false };
}

// Categoria după cuvinte-cheie din numele magazinului (când nu există un istoric)
const RULES: [RegExp, string][] = [
  [/lukoil|petrom|rompetrol|bemol|tirex|avante|benzin|fuel|\bgaz station|shell|omv|\bmol\b|socar/, "car"],
  [/linella|kaufland|fidesco|green ?hills|\bnr ?1\b|metro|local|merci|supermarket|market|alimentar|lidl|auchan|carrefour|mega|frank|ocean/, "cart"],
  [/farm|pharm|apteka|felicia|hippocrates|med|clinic|stomat|dent/, "heart"],
  [/orange|moldcell|unite|starnet|premier energy|termoelectrica|apa canal|energocom|utilit/, "bolt"],
  [/restaurant|cafe|cafenea|coffee|pizza|burger|mcdonald|kfc|andy|glovo|straus|bolt food|wolt|cinema|teatru|ticket/, "ticket"],
  [/zara|h ?& ?m|lc waikiki|reserved|sinsay|pepco|defacto|sport|nike|adidas|haine|cloth/, "shirt"],
  [/maximum|enter|darwin|bomba|emag|ultra|electro|apple|ikea|jysk|casa|home|brico/, "home"],
  [/scoal|school|gradinit|carti|librar|biblion|toys|jucar|kids|copii/, "school"],
];
export function guessCategoryIcon(merchant: unknown): string | null {
  const m = norm(merchant);
  if (!m) return null;
  for (const [re, icon] of RULES) if (re.test(m)) return icon;
  return null;
}
