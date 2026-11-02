// Mesaje vocale la bot: transcriere (Whisper prin Groq sau OpenAI) și curățarea frazei vorbite,
// ca „Am cumpărat pâine de 12 lei.” să devină „pâine 12 lei”, la fel ca scris de mână.

export function normalizeSpoken(s: string): string {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  t = t.replace(/[.!?…]+$/g, "").replace(/^[«"„']+|[»"”']+$/g, "");
  // sarcinile și cumpărăturile au regulile lor: doar punctuația
  if (/^(sarcin[aă]|sarcini|cump[aă]r[aă]|задач[аи]|купить)\s*[:,]?\s/i.test(t)) return t.replace(/^(\S+?)[,]?\s/, (m, w) => w.replace(/:$/, "") + ": ");
  t = t.replace(/(\d),(\d{3})(?!\d)/g, "$1$2");            // 1,200 → 1200
  t = t.replace(/(\d) (\d{3})(?!\d)/g, "$1$2");            // 1 200 → 1200
  t = t.replace(/,(?!\d)/g, " ").replace(/\s+/g, " ").trim(); // virgulele dintre cuvinte
  // începuturi de propoziție care nu spun nimic despre cheltuială
  t = t.replace(/^(am (cumpărat|cumparat|dat|plătit|platit|cheltuit)|cheltuială|cheltuiala|я )?\s*/i, "");
  t = t.replace(/^(купил[аи]?|потратил[аи]?|заплатил[аи]?|расход)\s+/i, "");
  // venit spus cu voce
  if (/^(venit|încasare|incasare|plus|доход|приход)\s+/i.test(t)) t = "+" + t.replace(/^\S+\s+/, "");
  // „de 12 lei”, „за 45 леев”, „45 de lei”
  t = t.replace(/\s(de|за)\s+(?=\d)/giu, " ");
  t = t.replace(/(\d)\s+de\s+(lei|euro|dolari)/giu, "$1 $2");
  const END = "(?![\\p{L}])";
  t = t.replace(new RegExp("(\\d)\\s*(леев|лей|лея|лэй)" + END, "giu"), "$1 lei")
    .replace(new RegExp("(\\d)\\s*евро" + END, "giu"), "$1€")
    .replace(new RegExp("(\\d)\\s*(долларов|доллара|доллар|dolari|dolar)" + END, "giu"), "$1$");
  return t.replace(/\s+/g, " ").trim();
}

export function voiceConfig(env: (k: string) => string | undefined) {
  const key = env("VOICE_API_KEY") ?? "";
  if (!key) return null;
  const groq = key.startsWith("gsk_");
  return {
    key,
    url: env("VOICE_API_URL") || (groq ? "https://api.groq.com/openai/v1/audio/transcriptions" : "https://api.openai.com/v1/audio/transcriptions"),
    model: env("VOICE_MODEL") || (groq ? "whisper-large-v3-turbo" : "whisper-1"),
  };
}

// Descarcă vocea de la Telegram și o trimite la transcriere
export async function transcribe(botToken: string, fileId: string, lang: "ro" | "ru", cfg: { key: string; url: string; model: string }): Promise<string> {
  const f = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) => r.json());
  const path = f?.result?.file_path;
  if (!path) throw new Error("getFile");
  const audio = await fetch(`https://api.telegram.org/file/bot${botToken}/${path}`);
  if (!audio.ok) throw new Error("download");
  const form = new FormData();
  form.append("file", new Blob([await audio.arrayBuffer()], { type: "audio/ogg" }), "voice.ogg");
  form.append("model", cfg.model);
  form.append("language", lang);
  form.append("response_format", "json");
  // un exemplu de stil ajută la cifre și nume de magazine
  form.append("prompt", lang === "ru" ? "кофе 45, бензин 900 cash, Linella 385,50 maib, задача: оплатить свет 450" : "cafea 45, benzină 900 cash, Linella 385,50 maib, sarcină: plătește lumina 450");
  const r = await fetch(cfg.url, { method: "POST", headers: { Authorization: `Bearer ${cfg.key}` }, body: form });
  if (!r.ok) throw new Error("transcribe " + r.status);
  const j = await r.json();
  return String(j?.text ?? "").trim();
}
