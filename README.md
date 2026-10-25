# Banii Familiei

Mini aplicație Telegram pentru finanțele familiei: conturi, tranzacții cu bonuri, credite, mașină, investiții, bugete, rapoarte și notificări de la bot. Română și rusă.

- **Aplicația:** Vue 3 + Vite, pe GitHub Pages (`https://<cont>.github.io/<depozit>/`)
- **Date:** Supabase, cu securitate pe rânduri (RLS): fiecare familie vede doar datele ei
- **Server:** funcțiile Supabase (login prin Telegram, bot, notificări, rapoarte)

Fiecare instalare are **botul ei, baza ei de date și pagina ei**. Nimic nu e comun între familii.

## Instalare pentru o familie nouă (~20 de minute, gratuit)

Ideal, contul de GitHub, de Supabase și botul sunt ale familiei care îl folosește: așa doar ea are acces la date.

### 1. Botul Telegram
În Telegram, la **@BotFather**: `/newbot` → un nume → un username care se termină în `bot`. Păstrează **tokenul** (îl pui doar în GitHub, la pasul 4 — nu-l trimite nimănui).

### 2. Baza de date Supabase
Pe **supabase.com** → *New project*. Alege o parolă pentru baza de date și păstreaz-o. Regiunea: *Central EU (Frankfurt)*.
Din adresa proiectului (`supabase.com/dashboard/project/`**`abcdefghij…`**) copiază **codul proiectului**.
Apoi: avatar → *Account preferences* → *Access Tokens* → *Generate new token*.

### 3. Copia codului pe GitHub
Pe pagina acestui depozit: **Use this template → Create a new repository** (sau *Fork*), cu orice nume, de ex. `banii-familiei`.
În depozitul nou: **Settings → Pages → Source: GitHub Actions**. Dacă e fork: tab-ul **Actions → „I understand… enable”**.

### 4. Setările (Settings → Secrets and variables → Actions)
**Secrets** (*New repository secret*):

| Nume | Ce pui |
|---|---|
| `TELEGRAM_BOT_TOKEN` | tokenul de la @BotFather |
| `SUPABASE_ACCESS_TOKEN` | tokenul de la pasul 2 |
| `SUPABASE_DB_PASSWORD` | parola bazei de date |
| `OWNER_TELEGRAM_ID` | ID-ul Telegram al proprietarului (îl afli de la @userinfobot, sau de la botul tău cu `/id` după prima publicare) |

**Variables** (*New repository variable*):

| Nume | Ce pui |
|---|---|
| `SUPABASE_PROJECT_REF` | codul proiectului de la pasul 2 |

Cheia publică a proiectului și numele botului se află singure la publicare. (Dacă cheia nu poate fi aflată, pune-o în variabila `SUPABASE_PUBLISHABLE_KEY`: *Project Settings → API Keys → Publishable key*. Niciodată cheia *secret*.)

### 5. Publicarea
**Actions → Publicare → Run workflow**. În 3–5 minute: tabelele în baza de date, funcțiile serverului, pagina aplicației și botul (meniul „Deschide”, comenzile) sunt gata.
Dacă `OWNER_TELEGRAM_ID` lipsea: deschide botul, scrie `/id`, adaugă secretul și rulează din nou.

### 6. Prima deschidere
Deschide botul → **Start** → **Deschide**. La prima intrare a proprietarului se creează familia, cu categorii de bază. Ceilalți membri intră prin **Mai mult → Familie și acces → Invită**.

Notificările (dimineața, seara, duminică, pe 1 ale lunii) pornesc singure din `notify.yml`.

## Actualizări
Ce se schimbă în depozitul original ajunge în copie cu **Sync fork** (dacă e fork) sau copiind modificările; fiecare `push` în `main` republică automat.

## Securitate
- Intrarea se face doar din Telegram; serverul verifică semnătura fiecărei deschideri cu tokenul botului, care stă doar pe server.
- Au acces doar proprietarul (`OWNER_TELEGRAM_ID`) și cei invitați (invitații de unică folosință, 7 zile).
- RLS: fiecare membru vede și modifică doar datele familiei lui; nimeni nu își poate schimba singur rolul.
- Bonurile stau într-un spațiu privat, cu linkuri temporare. Codul PIN și cheile Apple Pay se păstrează doar ca hash.
- Cheia din aplicație (`sb_publishable_…`) e publică prin definiție; protecția datelor vine din RLS.

## Dezvoltare locală
```bash
npm install
npm test
npm run build
```
