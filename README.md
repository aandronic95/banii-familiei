# Banii Familiei

Mini aplicație Telegram pentru finanțele familiei: conturi (carduri, cash, depozite), tranzacții cu poze de bon, credite cu grafic de rambursare, mașina (benzină, consum, service, asigurări), bugete pe categorii, rapoarte și notificări de la bot. Română și rusă, temă luminoasă și întunecată după Telegram.

- **Aplicația:** Vue 3 + Vite, publicată pe GitHub Pages: `https://aandronic95.github.io/banii-familiei/`
- **Date:** Supabase (proiect `ecfehopapvxngnxecetg`), cu securitate pe rânduri (RLS)
- **Bot:** [@andronicfambot](https://t.me/andronicfambot)

## Securitate

- Intrarea se face doar din Telegram. Serverul verifică semnătura Telegram a fiecărei deschideri (cu tokenul botului, care stă doar pe server) și apoi dă o sesiune.
- Au acces doar membrii din tabelul `members`: proprietarul (ID-ul din `OWNER_TELEGRAM_ID`) și cei care au intrat cu o invitație. Invitațiile sunt de unică folosință și expiră în 7 zile.
- Politicile RLS din baza de date lasă fiecare membru să vadă și să modifice doar datele familiei lui. Nimeni nu își poate schimba singur rolul.
- Bonurile stau într-un spațiu privat; se deschid prin linkuri temporare (10 minute).
- Cheia din aplicație (`sb_publishable_…`) e publică prin definiție; protecția datelor vine din RLS.

## Instalare (o singură dată)

### 1. Depozitul GitHub
Creează depozitul `banii-familiei` în contul `aandronic95` și încarcă acest cod în ramura `main`.

În **Settings → Pages**, la *Source* alege **GitHub Actions**.

### 2. Secretele (Settings → Secrets and variables → Actions → New repository secret)

| Nume | De unde îl iei |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/mybots` → andronicfambot → *API Token* |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → avatar → *Account preferences* → *Access Tokens* → *Generate new token* |
| `SUPABASE_DB_PASSWORD` | Parola bazei de date, aleasă la crearea proiectului (o poți reseta în *Project Settings → Database*) |
| `OWNER_TELEGRAM_ID` | ID-ul tău Telegram: scrie-i `/id` lui @andronicfambot după primul deploy, sau folosește @userinfobot |

Tokenul botului nu ajunge niciodată în aplicație; doar serverul îl folosește.

### 3. Publicarea
Orice `push` în `main` (sau *Actions → Publicare → Run workflow*) face automat:
1. testele și build-ul aplicației, apoi publicarea pe GitHub Pages;
2. crearea tabelelor în Supabase, publicarea funcțiilor serverului și setarea secretelor;
3. configurarea botului: webhook, butonul „Deschide” din meniu și comenzile.

### 4. Prima deschidere
Deschide @andronicfambot, apasă **Start**, apoi **Deschide**. La prima intrare a proprietarului se creează familia, cu categorii de bază și un portofel cash.

### 5. Invitarea soției
În aplicație: **Mai mult → Familie și acces → Invită prin Telegram**. Trimite-i linkul; ea îl deschide, apasă **Start** și **Deschide**, și are acces complet.

## Notificări
Rulate de GitHub Actions (`notify.yml`): zilnic dimineața (scadențe credite cu 3 zile înainte și în ziua plății, asigurări și revizie cu 30/7/1 zile înainte, buget la 80% și 100%, plus cursul BNM pentru EUR și USD) și duminică seara (rezumatul săptămânii). Fiecare persoană le poate opri din **Mai mult**.

## Dezvoltare locală
```bash
npm install
npm test        # semnătura Telegram, secretele, graficul de credit
npm run build
```
Aplicația funcționează doar deschisă din Telegram; în browser arată un ecran cu linkul spre bot.
