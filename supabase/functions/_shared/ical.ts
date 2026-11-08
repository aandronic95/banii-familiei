// Calendar iCalendar (.ics) pentru Google Calendar / iPhone: plăți, rate, salariu, dobânzi, zile de naștere
export type CalEvent = { uid: string; date: string; title: string; note?: string; yearly?: boolean; alarm?: boolean };

const esc = (s: string) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replace(/-/g, "");
const next = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
// rândurile mai lungi de 75 de octeți se rup (cerința formatului), fără să tăiem o literă în două
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(name: string, events: CalEvent[], stamp: string): string {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Banii Familiei//RO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Europe/Chisinau", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  for (const e of events) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}@banii-familiei`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(next(e.date))}`,
      `SUMMARY:${esc(e.title)}`, "TRANSP:TRANSPARENT");
    if (e.note) L.push(`DESCRIPTION:${esc(e.note)}`);
    if (e.yearly) L.push("RRULE:FREQ=YEARLY");
    // memento cu o zi înainte, la 9:00 (iPhone; Google folosește setările lui)
    if (e.alarm) L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "TRIGGER:-PT15H", "END:VALARM");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}
