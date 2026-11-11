// Butoane rapide în bot: cheltuielile cele mai dese („Cafea 45”), ca tastatură sub câmpul de scris
export type QTx = { merchant: string | null; amount: number; currency: string; date: string; cash?: boolean };

// Cele mai dese perechi (descriere, sumă) din ultimele 90 de zile; minim 2 apariții
export function quickButtons(txs: QTx[], max = 8): string[] {
  const g = new Map<string, { n: number; last: string; label: string }>();
  for (const x of txs) {
    const name = String(x.merchant ?? "").trim();
    if (!name || name.length > 24 || /\d/.test(name)) continue; // numele cu cifre ar strica citirea sumei
    const amt = Math.round(Number(x.amount) * 100) / 100;
    if (!(amt > 0)) continue;
    const cur = x.currency === "MDL" ? "" : x.currency === "EUR" ? "€" : x.currency === "USD" ? "$" : " " + x.currency.toLowerCase();
    const label = `${name} ${String(amt).replace(".", ",")}${cur}`;
    const k = label.toLowerCase();
    const e = g.get(k) ?? { n: 0, last: "", label };
    e.n++; if (x.date > e.last) e.last = x.date;
    g.set(k, e);
  }
  return [...g.values()].filter((e) => e.n >= 2).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, max).map((e) => e.label);
}

export function quickKeyboard(labels: string[], hide: string) {
  const rows: { text: string }[][] = [];
  for (let i = 0; i < labels.length; i += 2) rows.push(labels.slice(i, i + 2).map((text) => ({ text })));
  rows.push([{ text: hide }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}
export const QK = {
  ro: { hide: "✖️ Ascunde butoanele", shown: "⌨️ Butoanele rapide sunt sub câmpul de scris: o atingere adaugă cheltuiala. Se refac cu /butoane.", none: "Încă nu am ce propune: butoanele apar după ce aceeași cheltuială (același nume și aceeași sumă) se repetă de cel puțin 2 ori.", hidden: "Butoanele sunt ascunse. Le aduci înapoi cu /butoane." },
  ru: { hide: "✖️ Скрыть кнопки", shown: "⌨️ Быстрые кнопки под полем ввода: одно нажатие добавляет расход. Обновить — /butoane.", none: "Пока нечего предложить: кнопки появятся, когда один и тот же расход (то же название и сумма) повторится хотя бы 2 раза.", hidden: "Кнопки скрыты. Вернуть — /butoane." },
};
