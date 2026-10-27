// deno-lint-ignore-file no-explicit-any
// Apelat de aplicație după ce salvezi o cheltuială: anunță ceilalți adulți dacă suma trece de pragul lor.
// Cere login; poți declanșa doar pentru o tranzacție din familia ta.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { cors, json, tg } from "../_shared/telegram.ts";
import { bigSpendAlert } from "../_shared/alert.ts";
import { taskButtons, taskLine, T as TT } from "../_shared/tasks.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));

  // Sarcini: { task: <id>, event: "assigned" | "comment", comment?: <id> } — anunță ceilalți implicați
  if (typeof body.task === "string" && /^[0-9a-f-]{36}$/i.test(body.task)) {
    const { data: me } = await db.from("members").select("id, name, family_id").eq("user_id", u.user.id).in("role", ["owner", "editor"]).maybeSingle();
    if (!me) return json({ error: "forbidden" }, 403);
    const { data: task } = await db.from("tasks").select("*").eq("id", body.task).eq("family_id", me.family_id).maybeSingle();
    if (!task) return json({ error: "not_found" }, 404);
    const { data: mem } = await db.from("members").select("id, user_id, name, telegram_id, lang, role, notify").eq("family_id", me.family_id);
    const people = mem ?? [];
    let to: any[] = [];
    let head = (lg: "ro" | "ru") => "";
    let extra = "";
    if (body.event === "assigned") {
      to = people.filter((m) => m.id === task.assignee_id && m.id !== me.id);
      head = (lg) => TT[lg].assigned(me.name);
    } else if (body.event === "comment" && typeof body.comment === "string") {
      const { data: c } = await db.from("task_comments").select("body, member_id, task_id").eq("id", body.comment).eq("task_id", task.id).maybeSingle();
      if (!c) return json({ error: "not_found" }, 404);
      extra = "\n\n“" + c.body.slice(0, 300) + "”";
      // cel căruia i s-a dat sarcina, cine a creat-o și cine a mai comentat — fără autor
      const { data: others } = await db.from("task_comments").select("member_id").eq("task_id", task.id);
      const ids = new Set([task.assignee_id, ...(others ?? []).map((o: any) => o.member_id)]);
      const creator = people.find((m) => m.user_id && m.user_id === task.created_by);
      if (creator) ids.add(creator.id);
      if (!task.assignee_id) for (const m of people) ids.add(m.id); // sarcină pentru oricine: toată familia
      to = people.filter((m) => ids.has(m.id) && m.id !== me.id);
      head = (lg) => TT[lg].comment(me.name);
    } else return json({ error: "bad_request" }, 400);
    let sent = 0;
    for (const m of to) {
      if (!m.telegram_id || m.role === "none" || m.notify?.tasks === false) continue;
      const lg = m.lang === "ru" ? "ru" : "ro";
      const r = await tg(BOT_TOKEN, "sendMessage", { chat_id: m.telegram_id, text: head(lg) + "\n" + taskLine(task, lg, people) + extra, reply_markup: taskButtons(task, lg, APP_URL) }).catch(() => null);
      if (r?.ok) sent++;
    }
    return json({ ok: true, sent });
  }
  const ids: string[] = (Array.isArray(body.ids) ? body.ids : [body.id]).filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
  if (!ids.length) return json({ error: "bad_request" }, 400);

  const { data: rows } = await db.from("transactions").select("id, family_id").in("id", ids);
  const { data: mine } = await db.from("members").select("family_id").eq("user_id", u.user.id).in("role", ["owner", "editor"]);
  const fams = new Set((mine ?? []).map((m: any) => m.family_id));
  let sent = 0;
  for (const r of rows ?? []) if (fams.has(r.family_id)) sent += await bigSpendAlert(db, BOT_TOKEN, APP_URL, r.id);
  return json({ ok: true, sent });
});
