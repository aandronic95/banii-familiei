// Webhook-ul botului: /start (cu sau fără invitație) și /id.
import { derivedSecret, tg } from "../_shared/telegram.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const expected = await derivedSecret(BOT_TOKEN, "webhook");
  if (req.headers.get("x-telegram-bot-api-secret-token") !== expected) return new Response("forbidden", { status: 403 });

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.text || msg.chat?.type !== "private") return new Response("ok");

  const text: string = msg.text.trim();
  const chatId = msg.chat.id;
  const ru = (msg.from?.language_code ?? "").startsWith("ru");

  if (text.startsWith("/id")) {
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: (ru ? "Ваш Telegram ID: " : "ID-ul tău Telegram: ") + `<code>${msg.from.id}</code>`,
      parse_mode: "HTML",
    });
    return new Response("ok");
  }

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1] ?? "";
    const invite = payload.startsWith("inv_") ? payload.slice(4).replace(/[^A-Za-z0-9]/g, "") : "";
    const url = invite ? `${APP_URL}?invite=${invite}` : APP_URL;
    const intro = invite
      ? (ru ? "Вас пригласили в семейный бюджет. Нажмите кнопку, чтобы присоединиться." : "Ai fost invitat(ă) în bugetul familiei. Apasă butonul ca să intri.")
      : (ru ? "Семейный бюджет: счета, кредиты, машина и расходы." : "Banii familiei: conturi, credite, mașina și cheltuieli.");
    await tg(BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: intro,
      reply_markup: { inline_keyboard: [[{ text: ru ? "Открыть" : "Deschide", web_app: { url } }]] },
    });
  }
  return new Response("ok");
});
