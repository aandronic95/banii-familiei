// Webhook-ul botului: /start (cu sau fără invitație), /id, /ajutor, /sarcini, /cumparaturi,
// cheltuieli scrise direct („cafea 45”), sarcini („sarcină: …”), cumpărături („cumpără: …”) și butoanele „Anulează” / „Gata”.
import { bigSpendAlert } from "../_shared/alert.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { derivedSecret, tg } from "../_shared/telegram.ts";
import { parseQuick, pickAccount } from "../_shared/quick.ts";
import { parseTask } from "../_shared/taskparse.ts";
import { completeTask, taskButtons, taskLine, T as TT, dmy } from "../_shared/tasks.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());
const fmt = (n: number) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ok = () => new Response("ok");

const HELP = {
  ro: "Scrie-mi o cheltuială și o salvez:\n• <code>cafea 45</code>\n• <code>benzină 900 cash</code>\n• <code>linella 385,50 maib</code>\n• <code>20€ revolut netflix</code>\n• <code>+salariu 14200</code> (venit)\n\nPoți scrie mai multe, câte una pe rând. Contul: „cash” sau numele cardului; altfel se ia primul tău card.\n\n<b>Sarcini</b>\n• <code>sarcină: schimbă uleiul vineri la 18:00</code>\n• <code>sarcină: plătește lumina 450 lei pe 15 pentru Ana</code>\n• <code>sarcină: udă florile în fiecare sâmbătă</code>\n• <code>cumpără: lapte, pâine 2, ouă</code>\n/sarcini — ce e deschis · /cumparaturi — lista",
  ru: "Напишите расход, и я его сохраню:\n• <code>кофе 45</code>\n• <code>бензин 900 cash</code>\n• <code>linella 385,50 maib</code>\n• <code>20€ revolut netflix</code>\n• <code>+зарплата 14200</code> (доход)\n\nМожно несколько, по одному в строке. Счёт: «cash» или название карты; иначе первая ваша карта.\n\n<b>Задачи</b>\n• <code>задача: поменять масло в пятницу в 18:00</code>\n• <code>задача: оплатить свет 450 лей до 15 для Анны</code>\n• <code>купить: молоко, хлеб 2, яйца</code>\n/sarcini — открытые задачи · /cumparaturi — список",
};

async function memberByTelegram(tgId: number) {
  const { data } = await db.from("members").select("id, family_id, user_id, name, lang, role").eq("telegram_id", tgId).maybeSingle();
  return data && data.role !== "none" ? data : null;
}

async function saveQuick(member: { id: string; family_id: string; user_id: string | null }, line: string) {
  const q = parseQuick(line);
  if (!q) return null;
  const { data: accounts } = await db.from("accounts").select("id, name, type, currency, bank, last4, wallet_alias, member_id, archived").eq("family_id", member.family_id);
  const account = pickAccount(q, accounts ?? [], member.id);
  if (!account) return { error: "no_account" as const };
  const { data: cats } = await db.from("categories").select("id, icon, kind, name_ro, name_ru, archived").eq("family_id", member.family_id).eq("kind", q.kind);

  let categoryId: string | null = null;
  let carKind: string | null = null;
  // Ce s-a ales ultima dată la aceeași descriere
  if (q.description) {
    const { data: prev } = await db.from("transactions").select("category_id, car_kind").eq("family_id", member.family_id)
      .eq("kind", q.kind).ilike("merchant", q.description).not("category_id", "is", null).order("created_at", { ascending: false }).limit(1);
    if (prev?.[0]) { categoryId = prev[0].category_id; carKind = prev[0].car_kind; }
  }
  if (!categoryId && q.kind === "income") {
    const salary = (cats ?? []).find((c) => c.icon === "wallet" && !c.archived);
    if (salary && /salar|зарплат/i.test(q.description ?? "")) categoryId = salary.id;
  }
  if (!categoryId && q.categoryIcon) {
    const c = (cats ?? []).find((x) => x.icon === q.categoryIcon && !x.archived);
    if (c) { categoryId = c.id; if (q.isFuel) carKind = "fuel"; }
  }
  if (!categoryId && q.description) {
    // numele categoriei scris direct („haine 300”)
    const d = q.description.toLowerCase();
    const c = (cats ?? []).find((x) => !x.archived && (d.includes(x.name_ro.toLowerCase()) || d.includes(x.name_ru.toLowerCase())));
    if (c) categoryId = c.id;
  }
  let carId: string | null = null;
  if (carKind) {
    const { data: cars } = await db.from("cars").select("id").eq("family_id", member.family_id).order("created_at").limit(1);
    carId = cars?.[0]?.id ?? null;
    if (!carId) carKind = null;
  }

  const { data: tx, error } = await db.from("transactions").insert({
    family_id: member.family_id, kind: q.kind, amount: q.amount, account_id: account.id, category_id: categoryId,
    member_id: member.id, date: todayLocal(), merchant: q.description, note: "Telegram", created_by: member.user_id,
    car_id: carId, car_kind: carKind, tags: q.tags,
  }).select("id").single();
  if (error || !tx) return { error: "save" as const };
  if (q.kind === "expense") await bigSpendAlert(db, BOT_TOKEN, APP_URL, tx.id).catch(() => 0);
  const cat = (cats ?? []).find((c) => c.id === categoryId);
  return { tx, q, account, cat };
}

// deno-lint-ignore no-explicit-any
async function notifyAssignee(task: any, byName: string) {
  const { data: a } = await db.from("members").select("telegram_id, lang, notify, role").eq("id", task.assignee_id).maybeSingle();
  if (!a?.telegram_id || a.role === "none" || a.notify?.tasks === false) return;
  const { data: mem } = await db.from("members").select("id, name").eq("family_id", task.family_id);
  const lg = a.lang === "ru" ? "ru" : "ro";
  await tg(BOT_TOKEN, "sendMessage", { chat_id: a.telegram_id, text: TT[lg].assigned(byName) + "\n" + taskLine(task, lg, mem ?? []), reply_markup: taskButtons(task, lg, APP_URL) }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();
  const expected = await derivedSecret(BOT_TOKEN, "webhook");
  if (req.headers.get("x-telegram-bot-api-secret-token") !== expected) return new Response("forbidden", { status: 403 });
  const update = await req.json().catch(() => null);

  // ── Butonul „Anulează” ──
  const cb = update?.callback_query;
  if (cb?.data) {
    const member = await memberByTelegram(cb.from.id);
    const ru = member?.lang === "ru";
    const [action, id] = String(cb.data).split(":");
    if (member && action === "del" && /^[0-9a-f-]{36}$/i.test(id ?? "")) {
      const { data: gone } = await db.from("transactions").delete().eq("id", id).eq("family_id", member.family_id).select("id");
      await tg(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id, text: gone?.length ? (ru ? "Удалено" : "Anulat") : (ru ? "Уже удалено" : "Deja șters") });
      if (cb.message) {
        await tg(BOT_TOKEN, "editMessageText", {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id,
          text: (ru ? "↩️ Отменено: " : "↩️ Anulat: ") + (cb.message.text ?? "").replace(/^✅ /, ""),
        });
      }
    } else if (member && action === "tdone" && /^[0-9a-f-]{36}$/i.test(id ?? "")) {
      // „✅ Gata” din mesajul botului
      const { data: task } = await db.from("tasks").select("*").eq("id", id).eq("family_id", member.family_id).maybeSingle();
      const lg = ru ? "ru" : "ro";
      if (!task || task.done) {
        await tg(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id, text: TT[lg].already });
      } else {
        const next = await completeTask(db, task, member.id).catch(() => null);
        await tg(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id, text: TT[lg].marked });
        if (cb.message) {
          await tg(BOT_TOKEN, "editMessageText", {
            chat_id: cb.message.chat.id, message_id: cb.message.message_id,
            text: "✅ " + task.title + (next?.due_date ? "\n🔁 " + TT[lg].next(dmy(next.due_date)) : ""),
          });
        }
      }
    } else {
      await tg(BOT_TOKEN, "answerCallbackQuery", { callback_query_id: cb.id });
    }
    return ok();
  }

  const msg = update?.message;
  if (!msg?.text || msg.chat?.type !== "private") return ok();
  const text: string = msg.text.trim();
  const chatId = msg.chat.id;
  const ruTg = (msg.from?.language_code ?? "").startsWith("ru");

  if (text.startsWith("/id")) {
    await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: (ruTg ? "Ваш Telegram ID: " : "ID-ul tău Telegram: ") + `<code>${msg.from.id}</code>`, parse_mode: "HTML" });
    return ok();
  }

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1] ?? "";
    const invite = payload.startsWith("inv_") ? payload.slice(4).replace(/[^A-Za-z0-9]/g, "") : "";
    const url = invite ? `${APP_URL}?invite=${invite}` : APP_URL;
    const intro = invite
      ? (ruTg ? "Вас пригласили в семейный бюджет. Нажмите кнопку, чтобы присоединиться." : "Ai fost invitat(ă) în bugetul familiei. Apasă butonul ca să intri.")
      : (ruTg ? "Семейный бюджет: счета, кредиты, машина и расходы.\nМожно просто написать расход, например: кофе 45" : "Banii familiei: conturi, credite, mașina și cheltuieli.\nPoți să-mi scrii direct o cheltuială, de exemplu: cafea 45");
    await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: intro, reply_markup: { inline_keyboard: [[{ text: ruTg ? "Открыть" : "Deschide", web_app: { url } }]] } });
    return ok();
  }

  const member = await memberByTelegram(msg.from.id);
  const ru = member ? member.lang === "ru" : ruTg;
  if (text.startsWith("/ajutor") || text.startsWith("/help") || text.startsWith("/pomosh")) {
    await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: HELP[ru ? "ru" : "ro"], parse_mode: "HTML" });
    return ok();
  }
  if (text.startsWith("/")) return ok();
  if (!member) {
    await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: ru ? "У вас нет доступа к семейному бюджету." : "Nu ai acces la bugetul familiei." });
    return ok();
  }

  const lg = ru ? "ru" : "ro";
  const { data: famMembers } = await db.from("members").select("id, name").eq("family_id", member.family_id);

  // ── /sarcini: ce e deschis, cu buton „Gata” ──
  if (/^\/(sarcini|tasks|zadachi)/i.test(text)) {
    const { data: open } = await db.from("tasks").select("*").eq("family_id", member.family_id).eq("done", false)
      .order("due_date", { ascending: true, nullsFirst: false }).limit(15);
    if (!open?.length) { await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: TT[lg].none }); return ok(); }
    await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: TT[lg].list });
    for (const t of open.slice(0, 10)) {
      await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: taskLine(t, lg, famMembers ?? []), reply_markup: taskButtons(t, lg, APP_URL) });
    }
    return ok();
  }
  // ── /cumparaturi: lista comună ──
  if (/^\/(cumparaturi|shop|pokupki)/i.test(text)) {
    const { data: items } = await db.from("shopping_items").select("name, qty").eq("family_id", member.family_id).eq("done", false).order("created_at").limit(60);
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: items?.length ? TT[lg].shopList + "\n" + items.map((i) => `• ${i.name}${i.qty ? " — " + i.qty : ""}`).join("\n") : TT[lg].shopNone,
      reply_markup: { inline_keyboard: [[{ text: TT[lg].open, web_app: { url: `${APP_URL}?view=shopping` } }]] },
    });
    return ok();
  }

  // ── Sarcini („sarcină: …”) și cumpărături („cumpără: …”) ──
  const pt = parseTask(text, { today: todayLocal(), members: famMembers ?? [] });
  if (pt?.kind === "shopping" && pt.items.length) {
    const { error } = await db.from("shopping_items").insert(pt.items.map((i) => ({ family_id: member.family_id, name: i.name, qty: i.qty, created_by: member.user_id })));
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: error ? (ru ? "Не удалось сохранить." : "Nu am putut salva.") : TT[lg].shopAdded(pt.items.length) + "\n" + pt.items.map((i) => `• ${i.name}${i.qty ? " — " + i.qty : ""}`).join("\n"),
      reply_markup: { inline_keyboard: [[{ text: TT[lg].open, web_app: { url: `${APP_URL}?view=shopping` } }]] },
    });
    return ok();
  }
  if (pt?.kind === "task" && pt.explicit) {
    const { data: task, error } = await db.from("tasks").insert({
      family_id: member.family_id, title: pt.title, kind: pt.money ? "money" : "task", assignee_id: pt.assignee_id,
      due_date: pt.due_date ?? (pt.repeat !== "none" ? todayLocal() : null), due_time: pt.due_time, repeat: pt.repeat,
      amount: pt.amount, created_by: member.user_id, category_id: null,
    }).select("*").single();
    if (error || !task) { await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: ru ? "Не удалось сохранить." : "Nu am putut salva." }); return ok(); }
    await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: TT[lg].added + "\n" + taskLine(task, lg, famMembers ?? []), reply_markup: taskButtons(task, lg, APP_URL) });
    // anunță persoana căreia i s-a dat sarcina
    if (task.assignee_id && task.assignee_id !== member.id) await notifyAssignee(task, member.name);
    return ok();
  }

  // ── Cheltuieli scrise direct, câte una pe rând (max. 10) ──
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 10);
  let savedAny = false;
  for (const line of lines) {
    const r = await saveQuick(member, line);
    if (!r) continue;
    if ("error" in r) {
      await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: r.error === "no_account" ? (ru ? "Сначала добавьте счёт в приложении." : "Adaugă întâi un cont în aplicație.") : (ru ? "Не удалось сохранить." : "Nu am putut salva.") });
      continue;
    }
    savedAny = true;
    const sign = r.q.kind === "income" ? "+" : "−";
    const catName = r.cat ? (ru ? r.cat.name_ru : r.cat.name_ro) : (ru ? "без категории" : "fără categorie");
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `✅ ${sign}${fmt(r.q.amount)} ${r.account.currency}${r.q.description ? " · " + r.q.description : ""} · ${catName} · ${r.account.name}`,
      reply_markup: { inline_keyboard: [[
        { text: ru ? "Изменить" : "Modifică", web_app: { url: `${APP_URL}?tx=${r.tx.id}` } },
        { text: ru ? "Отменить" : "Anulează", callback_data: `del:${r.tx.id}` },
      ]] },
    });
  }
  if (!savedAny) {
    await tg(BOT_TOKEN, "sendMessage", { chat_id: chatId, text: (ru ? "Не понял сумму. " : "N-am înțeles suma. ") + HELP[ru ? "ru" : "ro"], parse_mode: "HTML" });
  }
  return ok();
});
