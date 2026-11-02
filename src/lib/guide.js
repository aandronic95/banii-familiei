// Ghidul din aplicație: cum o folosești, cum o instalezi pentru altă familie, cum o actualizezi.
// Text cu **îngroșat**, `cod` și [link](https://…); fiecare bloc: { p } paragraf, { steps } pași numerotați, { list } puncte.

export const UPSTREAM = 'aandronic95/banii-familiei'

const ro = [
  {
    id: 'use', icon: 'list', title: 'Cum folosești aplicația',
    parts: [
      { h: 'Cheltuieli și venituri' },
      { p: 'Butonul verde **+** de jos adaugă o cheltuială. Suma se poate scrie și ca socoteală (`120+45`). Categoria se ghicește după descriere și după ce ai ales data trecută.' },
      { list: [
        '**Pentru cine**: alege cine a beneficiat (copilul, soția…) ca să vezi în Rapoarte cât costă fiecare.',
        '**Bonul fiscal**: butonul QR citește suma și data; textul bonului lipit adaugă toate produsele.',
        '**Etichete** (`#vacanta`): leagă cheltuieli din categorii diferite, de exemplu o călătorie sau o reparație.',
        '**Împarte bonul** pe mai multe categorii, **șabloane** pentru ce cumperi des.',
      ] },
      { h: 'Botul din Telegram' },
      { p: 'Scrie-i botului `cafea 45`, `benzină 900 cash` sau `+salariu 14200`. Sub mesaj alegi alt cont cu un buton. Poți trimite și **mesaj vocal** („Am cumpărat pâine de 12 lei”), dacă administratorul a pornit vocea.' },
      { list: ['`sarcină: plătește lumina 450 lei pe 15` — o sarcină cu memento', '`cumpără: lapte, pâine 2, ouă` — lista de cumpărături', '/sarcini, /cumparaturi, /id'] },
      { h: 'Planificare' },
      { list: [
        '**Bugete** pe categorii, cu avertizare la 80% și la depășire.',
        '**Plăți regulate** și **credite**: apar în calendar și în prognoza soldului.',
        '**Călătorii**: buget în euro, cât mai poți cheltui pe zi; în zilele călătoriei cheltuielile primesc eticheta singure.',
        '**Obiective**, **Lista de dorințe**, **Zile de naștere**, **Contoare** (lumină, gaz, apă).',
      ] },
      { h: 'Rapoarte' },
      { p: 'Venituri și cheltuieli pe 6 luni, regula 50/30/20, cheltuiala pe zi, pe categorii, cine a plătit și pentru cine, averea netă, abonamentele găsite automat. **Prețurile din bonuri** arată cât s-a scumpit un produs și unde e mai ieftin.' },
      { h: 'Siguranță' },
      { list: ['**Blocare** cu Face ID și cod (Mai mult → Blocare cu Face ID).', '**Istoric**: cine a schimbat sau a șters ceva, cu buton de refacere.', '**Backup** săptămânal în Excel de la bot și **Restaurare** din el.', 'Fără internet poți adăuga cheltuieli: se trimit singure când revine conexiunea.'] },
      { h: 'Mod demo' },
      { p: 'Mai mult → **Mod demo** deschide o familie inventată, ca să arăți aplicația cuiva fără datele voastre. Nimic nu se salvează; ieși cu butonul de sus.' },
    ],
  },
  {
    id: 'install', icon: 'users', title: 'Instalare pentru altă familie',
    parts: [
      { p: 'Fiecare familie are aplicația ei: botul ei, baza ei de date și pagina ei. Durează 20–30 de minute, gratuit, fără cod. Ideal, toate conturile sunt ale familiei noi, ca doar ea să aibă acces la date.' },
      { h: '1. Botul (BotFather)' },
      { steps: ['În Telegram deschide **@BotFather** → `/newbot`.', 'Dă-i un nume și un username care se termină în `bot`.', 'Păstrează **tokenul** primit (`123456789:AAF…`). E secret.'] },
      { h: '2. Baza de date (Supabase)' },
      { steps: [
        'Pe [supabase.com](https://supabase.com) → **New project**, regiunea **Central EU (Frankfurt)**. Păstrează **parola bazei**.',
        'Din adresa proiectului (`…/project/abcdefghijklmnopqrst`) notează **codul de 20 de litere**.',
        'Avatar → **Account preferences → Access Tokens → Generate new token** (alege „Never expires”). Păstrează **tokenul de acces**.',
      ] },
      { h: '3. Copia codului (GitHub)' },
      { steps: [
        'Din contul GitHub al familiei noi deschide [github.com/' + UPSTREAM + '](https://github.com/' + UPSTREAM + ') → **Fork** → **Create fork**.',
        'În copie: **Settings → Pages → Source: GitHub Actions**.',
        'Tab-ul **Actions** → **I understand my workflows, go ahead and enable them**.',
      ] },
      { h: '4. Setările' },
      { p: 'În copie: **Settings → Secrets and variables → Actions**.' },
      { list: [
        'Secret `TELEGRAM_BOT_TOKEN` — tokenul botului',
        'Secret `SUPABASE_ACCESS_TOKEN` — tokenul de acces Supabase',
        'Secret `SUPABASE_DB_PASSWORD` — parola bazei',
        'Secret `OWNER_TELEGRAM_ID` — ID-ul Telegram al proprietarului (îl spune @userinfobot sau comanda /id a botului)',
        'Variabilă `SUPABASE_PROJECT_REF` — codul de 20 de litere',
        'Opțional, secret `VOICE_API_KEY` — cheie gratuită de pe [console.groq.com](https://console.groq.com), pentru mesajele vocale',
      ] },
      { h: '5. Publicarea' },
      { p: '**Actions → Publicare → Run workflow**. După 3–5 minute apar trei bife verzi. Cu un X roșu, primul rând roșu spune ce lipsește.' },
      { h: '6. Prima deschidere' },
      { p: 'Deschide botul → **Start** → **Deschide**. Soția/soțul se invită din **Mai mult → Familie și acces**.' },
      { tip: 'Tokenurile și parola nu se trimit nimănui pe chat: ajung doar în setările GitHub.' },
    ],
  },
  {
    id: 'update', icon: 'upload', title: 'Actualizarea aplicației',
    parts: [
      { p: 'Versiunile noi apar în depozitul original. Copia ta (fork) le ia cu un clic; datele din baza ta rămân neatinse.' },
      { steps: [
        'Deschide pagina depozitului tău pe GitHub (butonul de mai jos).',
        'Sub butonul verde **Code** apasă **Sync fork** → **Update branch**.',
        'Publicarea pornește singură: tab-ul **Actions** → așteaptă 3–5 minute bifele verzi.',
        'Închide și redeschide aplicația din bot.',
      ] },
      { list: [
        'Dacă GitHub arată **Discard commits**, ai modificat ceva în copie; apasă-l doar dacă nu ai schimbări de păstrat.',
        'Dacă publicarea nu pornește, intră în **Actions** și pornește fluxurile (butonul verde), apoi **Publicare → Run workflow**.',
        'Tabelele noi se adaugă singure la publicare; nu e nevoie de nimic în Supabase.',
        'O copie făcută cu „Use this template” nu are **Sync fork**: fă un fork nou (pasul 3 de la instalare), pune aceleași setări și publică. Datele sunt în Supabase, deci nu se pierde nimic.',
      ] },
    ],
  },
]

const ru = [
  {
    id: 'use', icon: 'list', title: 'Как пользоваться',
    parts: [
      { h: 'Расходы и доходы' },
      { p: 'Зелёная кнопка **+** внизу добавляет расход. Сумму можно писать выражением (`120+45`). Категория угадывается по описанию и прошлым выборам.' },
      { list: [
        '**Для кого**: выберите, для кого расход (ребёнок, жена…), и в Отчётах будет видно, сколько стоит каждый.',
        '**Чек**: кнопка QR читает сумму и дату; вставленный текст чека добавляет все товары.',
        '**Метки** (`#отпуск`): связывают расходы из разных категорий, например поездку или ремонт.',
        '**Разделить чек** на несколько категорий, **шаблоны** для частых покупок.',
      ] },
      { h: 'Бот в Telegram' },
      { p: 'Напишите боту `кофе 45`, `бензин 900 cash` или `+зарплата 14200`. Под сообщением можно выбрать другой счёт. Можно отправить и **голосовое** («Купила хлеб за 12 лей»), если администратор включил голос.' },
      { list: ['`задача: оплатить свет 450 лей до 15` — задача с напоминанием', '`купить: молоко, хлеб 2, яйца` — список покупок', '/sarcini, /cumparaturi, /id'] },
      { h: 'Планирование' },
      { list: [
        '**Бюджеты** по категориям, с предупреждением на 80% и при превышении.',
        '**Регулярные платежи** и **кредиты**: в календаре и в прогнозе остатка.',
        '**Поездки**: бюджет в евро, сколько ещё можно тратить в день; в дни поездки расходы получают метку сами.',
        '**Цели**, **Список желаний**, **Дни рождения**, **Счётчики** (свет, газ, вода).',
      ] },
      { h: 'Отчёты' },
      { p: 'Доходы и расходы за 6 месяцев, правило 50/30/20, расход в день, по категориям, кто платил и для кого, чистые активы, найденные подписки. **Цены из чеков** показывают, насколько подорожал товар и где дешевле.' },
      { h: 'Безопасность' },
      { list: ['**Блокировка** Face ID и кодом (Ещё → Блокировка Face ID).', '**История**: кто что изменил или удалил, с кнопкой возврата.', 'Еженедельная **резервная копия** в Excel от бота и **восстановление** из неё.', 'Без интернета можно добавлять расходы: они отправятся сами, когда связь вернётся.'] },
      { h: 'Демо-режим' },
      { p: 'Ещё → **Демо-режим** открывает вымышленную семью, чтобы показать приложение без ваших данных. Ничего не сохраняется; выход — кнопкой сверху.' },
    ],
  },
  {
    id: 'install', icon: 'users', title: 'Установка для другой семьи',
    parts: [
      { p: 'У каждой семьи своё приложение: свой бот, своя база и своя страница. 20–30 минут, бесплатно, без кода. Лучше, чтобы все аккаунты принадлежали новой семье — тогда доступ к данным только у неё.' },
      { h: '1. Бот (BotFather)' },
      { steps: ['В Telegram откройте **@BotFather** → `/newbot`.', 'Задайте имя и username, оканчивающийся на `bot`.', 'Сохраните **токен** (`123456789:AAF…`). Он секретный.'] },
      { h: '2. База данных (Supabase)' },
      { steps: [
        'На [supabase.com](https://supabase.com) → **New project**, регион **Central EU (Frankfurt)**. Сохраните **пароль базы**.',
        'Из адреса проекта (`…/project/abcdefghijklmnopqrst`) запишите **код из 20 букв**.',
        'Аватар → **Account preferences → Access Tokens → Generate new token** («Never expires»). Сохраните **токен доступа**.',
      ] },
      { h: '3. Копия кода (GitHub)' },
      { steps: [
        'Из аккаунта GitHub новой семьи откройте [github.com/' + UPSTREAM + '](https://github.com/' + UPSTREAM + ') → **Fork** → **Create fork**.',
        'В копии: **Settings → Pages → Source: GitHub Actions**.',
        'Вкладка **Actions** → **I understand my workflows, go ahead and enable them**.',
      ] },
      { h: '4. Настройки' },
      { p: 'В копии: **Settings → Secrets and variables → Actions**.' },
      { list: [
        'Secret `TELEGRAM_BOT_TOKEN` — токен бота',
        'Secret `SUPABASE_ACCESS_TOKEN` — токен доступа Supabase',
        'Secret `SUPABASE_DB_PASSWORD` — пароль базы',
        'Secret `OWNER_TELEGRAM_ID` — Telegram ID владельца (подскажет @userinfobot или команда /id бота)',
        'Variable `SUPABASE_PROJECT_REF` — код из 20 букв',
        'Необязательно, secret `VOICE_API_KEY` — бесплатный ключ с [console.groq.com](https://console.groq.com) для голосовых',
      ] },
      { h: '5. Публикация' },
      { p: '**Actions → Publicare → Run workflow**. Через 3–5 минут появятся три зелёные галочки. При красном X первая красная строка объясняет, чего не хватает.' },
      { h: '6. Первый запуск' },
      { p: 'Откройте бота → **Start** → **Открыть**. Супруга/супруга приглашается в **Ещё → Семья и доступ**.' },
      { tip: 'Токены и пароль никому не отправляйте в чат: они вводятся только в настройках GitHub.' },
    ],
  },
  {
    id: 'update', icon: 'upload', title: 'Обновление приложения',
    parts: [
      { p: 'Новые версии появляются в исходном репозитории. Ваша копия (fork) получает их одним нажатием; данные в вашей базе не затрагиваются.' },
      { steps: [
        'Откройте страницу своего репозитория на GitHub (кнопка ниже).',
        'Под зелёной кнопкой **Code** нажмите **Sync fork** → **Update branch**.',
        'Публикация начнётся сама: вкладка **Actions** → подождите 3–5 минут зелёных галочек.',
        'Закройте и снова откройте приложение из бота.',
      ] },
      { list: [
        'Если GitHub показывает **Discard commits**, в копии были свои изменения; нажимайте, только если их не нужно сохранять.',
        'Если публикация не началась, во вкладке **Actions** включите процессы (зелёная кнопка), затем **Publicare → Run workflow**.',
        'Новые таблицы создаются при публикации сами; в Supabase ничего делать не нужно.',
        'У копии, сделанной через «Use this template», нет **Sync fork**: сделайте новый fork (шаг 3 установки), те же настройки и публикацию. Данные в Supabase, ничего не потеряется.',
      ] },
    ],
  },
]

export const GUIDE = { ro, ru }

// Text simplu → HTML sigur: **îngroșat**, `cod`, [text](https://…)
export function rich(s) {
  const esc = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return esc
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" data-ext="1">$1</a>')
}

// Versiunea instalată față de cea originală (commit-uri din GitHub, API public)
export function compareVersion(build, latest) {
  if (!build?.sha || !latest?.sha) return 'unknown'
  if (latest.sha.startsWith(build.sha) || build.sha.startsWith(latest.sha)) return 'current'
  if (build.date && latest.date && Date.parse(latest.date) > Date.parse(build.date) + 60000) return 'behind'
  return 'current'
}
