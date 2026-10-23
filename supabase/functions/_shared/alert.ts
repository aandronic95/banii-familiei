// Avertizare: cineva din familie a adăugat o cheltuială mare.
// Fiecare adult își alege pragul (members.notify.big, în MDL); 0 sau lipsă = oprit.
import { tg } from "./telegram.ts";
import { ratesFor } from "./bnm.ts";

const fmt = (n: number) => {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + d;
};

export async function bigSpendAlert(db: any, botToken: string, appUrl: string, txId: string): Promise<number> {
  if (!botToken || !txId) return 0;
  const { data: tx } = await db.from("transactions")
    .select("id, family_id, kind, amount, account_id, category_id, merchant, member_id, created_by, created_at, date")
    .eq("id", txId).maybeSingle();
  if (!tx || tx.kind !== "expense") return 0;
  if (Date.now() - Date.parse(tx.created_at) > 30 * 60000) return 0; // doar pentru cheltuieli proaspete
  const key = `big:${tx.id}`;
  const { data: done } = await db.from("notify_log").select("key").eq("key", key).maybeSingle();
  if (done) return 0;

  const [{ data: members }, { data: acc }, { data: cat }] = await Promise.all([
    db.from("members").select("id, user_id, name, telegram_id, lang, role, notify").eq("family_id", tx.family_id),
    db.from("accounts").select("name, currency").eq("id", tx.account_id).maybeSingle(),
    tx.category_id ? db.from("categories").select("name_ro, name_ru").eq("id", tx.category_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const cur = acc?.currency ?? "MDL";
  let mdl = Number(tx.amount);
  if (cur !== "MDL") {
    const r = await ratesFor(db, new Date().toISOString().slice(0, 10)).catch(() => null);
    mdl *= r?.rates?.[cur] ?? 1;
  }
  const author = (members ?? []).find((m: any) => tx.created_by && m.user_id === tx.created_by) ??
    (members ?? []).find((m: any) => m.id === tx.member_id);

  let sent = 0;
  for (const m of members ?? []) {
    const limit = Number(m.notify?.big) || 0;
    if (!limit || !m.telegram_id || m.role === "none" || mdl < limit) continue;
    if (author && m.id === author.id) continue; // nu te anunțăm de propria cheltuială
    const ru = m.lang === "ru";
    const catName = cat ? (ru ? cat.name_ru : cat.name_ro) : "";
    const who = author?.name ?? (ru ? "Кто-то" : "Cineva");
    const text = (ru ? `💸 ${who} потратил(а) много` : `💸 ${who} a făcut o cheltuială mare`) +
      `\n−${fmt(Number(tx.amount))} ${cur}${tx.merchant ? " · " + tx.merchant : ""}${catName ? " · " + catName : ""}` +
      (acc?.name ? `\n${acc.name}` : "");
    const r = await tg(botToken, "sendMessage", {
      chat_id: m.telegram_id, text,
      reply_markup: { inline_keyboard: [[{ text: ru ? "Открыть" : "Deschide", web_app: { url: `${appUrl}?tx=${tx.id}` } }]] },
    }).catch(() => null);
    if (r?.ok) sent++;
  }
  await db.from("notify_log").upsert({ key });
  return sent;
}
