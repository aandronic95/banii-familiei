// Sarcini pe server: bifare (cu repetare), texte pentru bot și butoane
// deno-lint-ignore-file no-explicit-any
import { nextDue } from "./taskparse.ts";

export const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());
export function nowLocalHM(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Chisinau", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// Bifează sarcina; dacă se repetă, creează următoarea (cu pașii debifați). Întoarce următoarea sarcină, dacă e.
export async function completeTask(db: any, task: any, memberId: string | null) {
  const today = todayLocal();
  const { error } = await db.from("tasks").update({ done: true, done_at: new Date().toISOString(), done_by: memberId }).eq("id", task.id).eq("done", false);
  if (error) throw error;
  if (task.repeat === "none") return null;
  const due = nextDue(task.due_date, task.repeat, task.repeat_every, today);
  if (!due) return null;
  const steps = Array.isArray(task.steps) ? task.steps.map((s: any) => ({ ...s, done: false })) : [];
  const { data } = await db.from("tasks").insert({
    family_id: task.family_id, title: task.title, note: task.note, kind: task.kind, assignee_id: task.assignee_id,
    created_by: task.created_by, due_date: due, due_time: task.due_time, repeat: task.repeat, repeat_every: task.repeat_every,
    amount: task.amount, category_id: task.category_id, account_id: task.account_id, steps, sort: task.sort,
  }).select("id, due_date").single();
  return data;
}

export const T = {
  ro: {
    done: "Gata", open: "Deschide", added: "📝 Sarcină adăugată", shopAdded: (n: number) => `🛒 Am pus în lista de cumpărături: ${n}`,
    due: (d: string, t: string | null) => `până ${d}${t ? " la " + t : ""}`, for: (n: string) => `pentru ${n}`, any: "oricine",
    rep: { daily: "zilnic", weekly: "săptămânal", monthly: "lunar" } as Record<string, string>,
    remind: "⏰ Memento", assigned: (who: string) => `📌 ${who} ți-a dat o sarcină`, comment: (who: string) => `💬 ${who} a scris la sarcina`,
    digest: (n: number) => `📋 Sarcinile de azi (${n})`, overdue: "întârziată", list: "📋 Sarcini deschise", none: "Nicio sarcină deschisă 👍",
    shopList: "🛒 De cumpărat", shopNone: "Lista de cumpărături e goală.", marked: "Bifat ✓", already: "Deja bifată", next: (d: string) => `Următoarea: ${d}`,
    money: "Când e gata, apasă „Deschide” ca să treci și cheltuiala.",
  },
  ru: {
    done: "Готово", open: "Открыть", added: "📝 Задача добавлена", shopAdded: (n: number) => `🛒 Добавлено в список покупок: ${n}`,
    due: (d: string, t: string | null) => `до ${d}${t ? " в " + t : ""}`, for: (n: string) => `для ${n}`, any: "любой",
    rep: { daily: "ежедневно", weekly: "еженедельно", monthly: "ежемесячно" } as Record<string, string>,
    remind: "⏰ Напоминание", assigned: (who: string) => `📌 ${who} назначил(а) вам задачу`, comment: (who: string) => `💬 ${who} написал(а) в задаче`,
    digest: (n: number) => `📋 Задачи на сегодня (${n})`, overdue: "просрочена", list: "📋 Открытые задачи", none: "Открытых задач нет 👍",
    shopList: "🛒 Купить", shopNone: "Список покупок пуст.", marked: "Отмечено ✓", already: "Уже отмечена", next: (d: string) => `Следующая: ${d}`,
    money: "Когда будет готово, нажмите «Открыть», чтобы записать и расход.",
  },
};
export type Lang = "ro" | "ru";
export const dmy = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".");

export function taskLine(t: any, lg: Lang, members: any[], today = todayLocal()) {
  const L = T[lg];
  const bits = [t.title];
  if (t.amount) bits.push(`${fmt(Number(t.amount))} MDL`);
  if (t.due_date) bits.push((t.due_date < today ? "⚠️ " + L.overdue + " · " : "") + L.due(dmy(t.due_date), t.due_time ? String(t.due_time).slice(0, 5) : null));
  if (t.repeat && t.repeat !== "none") bits.push("🔁 " + L.rep[t.repeat]);
  const a = members.find((m) => m.id === t.assignee_id);
  if (a) bits.push(L.for(a.name));
  const steps = Array.isArray(t.steps) ? t.steps : [];
  if (steps.length) bits.push(`☑ ${steps.filter((s: any) => s.done).length}/${steps.length}`);
  return bits.join(" · ");
}

export function taskButtons(t: any, lg: Lang, appUrl: string) {
  return { inline_keyboard: [[
    { text: "✅ " + T[lg].done, callback_data: `tdone:${t.id}` },
    { text: T[lg].open, web_app: { url: `${appUrl}?task=${t.id}` } },
  ]] };
}
