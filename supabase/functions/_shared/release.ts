// Anunțul din bot când aplicația primește o versiune nouă: ce e nou, într-un singur mesaj
export type Commit = { sha: string; title: string; date: string };
export const UPSTREAM = "aandronic95/banii-familiei";

// Titlurile noi față de ultima versiune anunțată (lista vine de la cea mai nouă la cea mai veche)
export function newCommits(list: Commit[], lastSha: string | null, max = 8): Commit[] {
  const out: Commit[] = [];
  for (const c of list) {
    if (lastSha && (c.sha.startsWith(lastSha) || lastSha.startsWith(c.sha))) break;
    out.push(c);
  }
  // prima dată: doar cele mai recente, nu tot istoricul
  return (lastSha ? out : out.slice(0, 5)).filter((c) => !/^(Merge |Publicare:|Revert )/i.test(c.title)).slice(0, max);
}

const clean = (t: string) => t.replace(/\s*\(#\d+\)$/, "").replace(/\s+/g, " ").trim();
export function releaseText(commits: Commit[], lang: "ro" | "ru"): string {
  const head = lang === "ru" ? "🆕 Приложение обновлено. Что нового:" : "🆕 Aplicația s-a actualizat. Ce e nou:";
  const tail = lang === "ru" ? "Закройте и снова откройте приложение, чтобы увидеть изменения." : "Închide și redeschide aplicația ca să vezi schimbările.";
  return [head, ...commits.map((c) => "• " + clean(c.title)), "", tail].join("\n");
}
export function behindText(lang: "ro" | "ru", repo: string): string {
  return lang === "ru"
    ? `🆕 Есть новая версия приложения, а ваша копия ещё не обновлена.\nGitHub → ваш репозиторий (${repo}) → «Sync fork» → «Update branch». Через 5 минут обновится само. Чтобы впредь обновлялось автоматически, добавьте секрет UPDATE_TOKEN (Справка и обновления в приложении).`
    : `🆕 Există o versiune nouă a aplicației, iar copia voastră nu s-a actualizat încă.\nGitHub → depozitul vostru (${repo}) → „Sync fork” → „Update branch”. În 5 minute se publică singură. Ca să se actualizeze de acum singură, adăugați secretul UPDATE_TOKEN (Ghid și actualizări, în aplicație).`;
}
