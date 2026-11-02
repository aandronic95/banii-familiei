// Rezumatul săptămânal din bot: pe zile (bare unicode), categorii, cele mai mari cheltuieli, comparație cu săptămâna trecută.
// Fără dependențe, ca să poată fi testat și în Node.

export type WeekTx = { kind: string; date: string; mdl: number; merchant?: string | null; cat?: { ro: string; ru: string } | null };
export type WeekInput = { from: string; to: string; cur: WeekTx[]; prev: WeekTx[]; total: number; trip?: { name: string; spent: string; budget: string | null } | null };

const fmt = (n: number) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\./g, " ");
const DAYS = { ro: ["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ"], ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] };
const MON = { ro: ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"], ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] };
const L = {
  ro: { title: "📊 Săptămâna", inc: "Venituri", exp: "Cheltuieli", saved: "Economisit", over: "Cheltuit peste venit", vs: "față de săptămâna trecută", days: "Pe zile", cats: "Pe categorii",
    top: "Cele mai mari cheltuieli", bal: "Sold total", other: "Altele", none: "Nicio cheltuială săptămâna aceasta 🎉", same: "la fel ca săptămâna trecută", trip: "Călătoria" },
  ru: { title: "📊 Неделя", inc: "Доходы", exp: "Расходы", saved: "Сэкономлено", over: "Потрачено больше дохода", vs: "к прошлой неделе", days: "По дням", cats: "По категориям",
    top: "Самые крупные расходы", bal: "Общий баланс", other: "Другое", none: "На этой неделе расходов нет 🎉", same: "как на прошлой неделе", trip: "Поездка" },
};

export function bar(v: number, max: number, w = 8): string {
  if (!(max > 0)) return "░".repeat(w);
  const n = Math.max(v > 0 ? 1 : 0, Math.round((v / max) * w));
  return "▇".repeat(n) + "░".repeat(w - n);
}
const dm = (iso: string, lg: "ro" | "ru") => `${Number(iso.slice(8, 10))} ${MON[lg][Number(iso.slice(5, 7)) - 1]}`;

export function weeklyText(x: WeekInput, lg: "ro" | "ru"): string {
  const l = L[lg] ?? L.ro;
  const sum = (a: WeekTx[], k: string) => a.filter((t) => t.kind === k).reduce((s, t) => s + t.mdl, 0);
  const inc = sum(x.cur, "income"), exp = sum(x.cur, "expense"), pexp = sum(x.prev, "expense");
  const out: string[] = [`${l.title} ${dm(x.from, lg)} – ${dm(x.to, lg)}`, ""];
  out.push(`${l.inc}: +${fmt(inc)} MDL`);
  let cmp = "";
  if (pexp > 0) {
    const d = (exp - pexp) / pexp;
    cmp = Math.abs(d) < 0.03 ? ` (${l.same})` : ` (${d > 0 ? "▲" : "▼"} ${Math.round(Math.abs(d) * 100)}% ${l.vs})`;
  }
  out.push(`${l.exp}: −${fmt(exp)} MDL${cmp}`);
  if (inc > 0) out.push(inc >= exp ? `${l.saved}: ${fmt(inc - exp)} MDL` : `${l.over}: ${fmt(exp - inc)} MDL`);

  const exps = x.cur.filter((t) => t.kind === "expense");
  if (!exps.length) out.push("", l.none);
  else {
    // pe zile, de la prima la ultima zi a săptămânii
    const days: { d: string; v: number }[] = [];
    for (let t = Date.parse(x.from); t <= Date.parse(x.to); t += 86400000) days.push({ d: new Date(t).toISOString().slice(0, 10), v: 0 });
    for (const t of exps) { const r = days.find((d) => d.d === t.date); if (r) r.v += t.mdl; }
    const dmax = Math.max(...days.map((d) => d.v));
    out.push("", `${l.days}:`);
    for (const d of days) out.push(`${DAYS[lg][new Date(d.d + "T12:00:00Z").getUTCDay()]} ${bar(d.v, dmax)} ${fmt(d.v)}`);

    const byCat = new Map<string, number>();
    for (const t of exps) { const k = (lg === "ru" ? t.cat?.ru : t.cat?.ro) ?? l.other; byCat.set(k, (byCat.get(k) ?? 0) + t.mdl); }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const shown = cats.slice(0, 5), rest = cats.slice(5).reduce((s, c) => s + c[1], 0);
    if (rest > 0) shown.push([l.other + " …", rest]);
    const cmax = Math.max(...shown.map((c) => c[1]));
    out.push("", `${l.cats}:`);
    for (const [k, v] of shown) out.push(`${bar(v, cmax, 6)} ${k} ${fmt(v)} (${Math.round((v / exp) * 100)}%)`);

    const top = [...exps].sort((a, b) => b.mdl - a.mdl).slice(0, 3);
    out.push("", `${l.top}:`);
    top.forEach((t, i) => out.push(`${i + 1}. ${t.merchant || (lg === "ru" ? t.cat?.ru : t.cat?.ro) || "—"} — ${fmt(t.mdl)} MDL (${dm(t.date, lg)})`));
  }
  if (x.trip) out.push("", `✈️ ${l.trip} „${x.trip.name}”: ${x.trip.spent}${x.trip.budget ? ` / ${x.trip.budget}` : ""}`);
  out.push("", `${l.bal}: ${fmt(x.total)} MDL`);
  return out.join("\n");
}
