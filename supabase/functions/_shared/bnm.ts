// Cursul oficial BNM (MDL pentru 1 unitate de valută)
// https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=DD.MM.YYYY
// deno-lint-ignore-file no-explicit-any

export const CURRENCIES = ["EUR", "USD"] as const;

export function parseBnmXml(xml: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const block of xml.match(/<Valute\b[\s\S]*?<\/Valute>/g) ?? []) {
    const code = block.match(/<CharCode>\s*([A-Z]{3})\s*<\/CharCode>/)?.[1];
    if (!code || !(CURRENCIES as readonly string[]).includes(code)) continue;
    const nominal = Number(block.match(/<Nominal>\s*([\d.,]+)\s*<\/Nominal>/)?.[1]?.replace(",", ".") ?? 1) || 1;
    const value = Number(block.match(/<Value>\s*([\d.,]+)\s*<\/Value>/)?.[1]?.replace(",", "."));
    if (value > 0) out[code] = Math.round((value / nominal) * 10000) / 10000;
  }
  return out;
}

// date: YYYY-MM-DD
export async function fetchBnm(date: string): Promise<Record<string, number>> {
  const [y, m, d] = date.split("-");
  const r = await fetch(`https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=${d}.${m}.${y}`, {
    headers: { "user-agent": "BaniiFamiliei/1.0", accept: "application/xml,text/xml" },
  });
  if (!r.ok) return {};
  return parseBnmXml(await r.text());
}

// Ia cursul pentru o dată (din bază, sau de la BNM și îl salvează)
export async function ratesFor(db: any, date: string): Promise<{ date: string; rates: Record<string, number>; source: string }> {
  const { data: have } = await db.from("rates").select("currency, rate").eq("date", date);
  const stored = Object.fromEntries((have ?? []).map((x: any) => [x.currency, Number(x.rate)]));
  if (CURRENCIES.every((c) => stored[c])) return { date, rates: stored, source: "db" };

  try {
    const fresh = await fetchBnm(date);
    const rows = Object.entries(fresh).map(([currency, rate]) => ({ currency, date, rate }));
    if (rows.length) {
      await db.from("rates").upsert(rows);
      return { date, rates: { ...stored, ...fresh }, source: "bnm" };
    }
  } catch (_) { /* BNM indisponibil: folosim ultimul curs salvat */ }

  const latest: Record<string, number> = {};
  let latestDate = date;
  for (const c of CURRENCIES) {
    const { data } = await db.from("rates").select("rate, date").eq("currency", c).lte("date", date)
      .order("date", { ascending: false }).limit(1);
    if (data?.[0]) { latest[c] = Number(data[0].rate); latestDate = data[0].date; }
  }
  return { date: latestDate, rates: latest, source: "fallback" };
}
