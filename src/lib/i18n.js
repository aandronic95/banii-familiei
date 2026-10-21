import { ref } from 'vue'

const saved = (() => { try { return localStorage.getItem('bf-lang') } catch (_) { return null } })()
const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || ''
export const lang = ref(saved || (tgLang.startsWith('ru') ? 'ru' : 'ro'))

export function setLang(l) {
  lang.value = l
  try { localStorage.setItem('bf-lang', l) } catch (_) {}
  document.documentElement.lang = l
}

const D = {
  ro: {
    // navigație
    home: 'Acasă', accounts: 'Conturi', reports: 'Rapoarte', more: 'Mai mult', add: 'Adaugă',
    back: 'Înapoi', cancel: 'Anulează', save: 'Salvează', delete: 'Șterge', edit: 'Modifică', all: 'Toate', none: 'Niciunul',
    loading: 'Se încarcă…', saved: 'Salvat', error: 'A apărut o eroare. Încearcă din nou.',
    // poartă
    openInTelegram: 'Deschide aplicația din Telegram', openInTelegramText: 'Aplicația funcționează doar în Telegram, prin botul familiei.',
    openBot: 'Deschide botul', notAllowed: 'Nu ai acces încă', notAllowedText: 'Acest cont Telegram nu face parte din familie. Cere o invitație de la cel care a creat aplicația.',
    yourId: 'ID-ul tău Telegram', inviteBad: 'Invitația nu mai e valabilă', inviteBadText: 'Linkul a expirat sau a fost deja folosit. Cere unul nou.',
    retry: 'Încearcă din nou',
    // acasă
    hello: 'Bună', availableAll: 'Disponibil în toate conturile', month: 'Luna', debts: 'Datorii',
    monthBudget: 'Bugetul lunii', recentTx: 'Tranzacții recente', noTx: 'Încă nu ai tranzacții. Apasă + ca să adaugi prima.',
    loanDueIn: (n, d, a) => `${n}: ${a} se plătește ${d}`, inDays: (d) => d === 0 ? 'azi' : d === 1 ? 'mâine' : `peste ${d} zile`,
    left: (a) => `Mai ai ${a} MDL`, over: (a) => `Depășit cu ${a} MDL`, daysLeft: (d) => `${d} zile`,
    // tranzacții
    newTx: 'Tranzacție nouă', editTx: 'Modifică tranzacția', expense: 'Cheltuială', income: 'Venit', transfer: 'Transfer',
    amount: 'Suma', category: 'Categorie', who: 'Cine', fromAccount: 'Din contul', toAccount: 'În contul', account: 'Contul',
    date: 'Data', merchant: 'Magazin', note: 'Notă', optional: 'Opțional', receipt: 'Fotografiază bonul', receiptChange: 'Schimbă poza bonului',
    receiptRemove: 'Scoate bonul', saveExpense: 'Salvează cheltuiala', saveIncome: 'Salvează venitul', saveTransfer: 'Salvează transferul',
    amountReceived: 'Suma primită', car: 'Mașina', fuel: 'Alimentare', liters: 'Litri', odometer: 'Kilometraj', fullTank: 'Plin',
    carPart: 'Pentru mașină', carService: 'Service', carOther: 'Altele', deleteTxQ: 'Ștergi tranzacția?', amountRequired: 'Scrie suma',
    accountRequired: 'Alege contul', transactions: 'Tranzacții', search: 'Caută', bon: 'bon',
    // conturi
    addAccount: 'Cont', newAccount: 'Cont nou', editAccount: 'Modifică contul', totalMdl: 'Total, convertit în MDL',
    cards: 'Carduri', cash: 'Cash', deposits: 'Depozite și economii', credits: 'Credite', activeLoans: (n) => `${n} credite active`,
    toPay: 'de achitat', name: 'Nume', type: 'Tip', currency: 'Moneda', owner: 'Al cui', common: 'Comun', bank: 'Banca',
    last4: 'Ultimele 4 cifre', openingBalance: 'Soldul acum', interest: 'Dobândă, % pe an', maturity: 'Scadența depozitului',
    archive: 'Arhivează', rateNote: (c, r) => `Curs salvat: 1 ${c} = ${r} MDL`, deleteAccountQ: 'Ștergi contul? Se poate doar dacă nu are tranzacții.',
    cantDeleteAccount: 'Contul are tranzacții. Arhivează-l în loc să-l ștergi.',
    // credite
    remaining: 'Rămas de achitat', monthlyRates: 'Rate pe lună', mortgage: 'Credit ipotecar', consumer: 'Credit de consum',
    perYear: 'pe an', until: 'până în', balanceLeft: 'Sold rămas', paidOf: (p, t) => `Achitat ${p}% din ${t}`, ratesOf: (a, b) => `${a} din ${b} rate`,
    due: 'Scadență', payment: 'Rată', principalShort: 'Corp', interestShort: 'Dobândă', markPaid: 'Marchează plătită', fullSchedule: 'Tot graficul',
    newLoan: 'Credit nou', editLoan: 'Modifică creditul', principal: 'Suma creditului', termMonths: 'Termen, luni', firstDue: 'Prima rată (data)',
    paidBefore: 'Rate deja plătite', monthlyPayment: 'Rata lunară din contract', monthlyPaymentHint: 'Lasă gol ca să se calculeze automat',
    payFrom: 'Se plătește din contul', payConfirm: (a, c) => `Înregistrezi plata de ${a} ${c}?`, paid: 'Plătită', noLoans: 'Nu ai credite adăugate.',
    closeLoan: 'Închide creditul', closed: 'închis', loanPaid: 'Plata a fost înregistrată',
    // mașina
    carTitle: 'Mașina', newCar: 'Adaugă mașina', carName: 'Marca și modelul', plate: 'Număr', startKm: 'Kilometraj acum', kmOnBoard: 'km la bord',
    per100: 'la 100 km', thisMonth: 'MDL luna asta', deadlines: 'Termene', refuels: 'Alimentări', serviceRepairs: 'Service și reparații',
    addEvent: 'Adaugă termen', eventKind: 'Ce expiră', rca: 'RCA', casco: 'Casco', inspection: 'Revizia tehnică', serviceDue: 'Service programat',
    dueDate: 'Data', dueKm: 'La kilometrajul', expiresIn: (t, d) => `${t} expiră ${d}`, kmLeft: (k) => `mai sunt ${k} km`, perYearShort: 'pe an',
    markDone: 'Gata, rezolvat', noCar: 'Adaugă mașina ca să urmărești benzina, service-ul și asigurările.',
    // rapoarte
    week: 'Săptămâna', year: 'Anul', incomeVsExpense: 'Venituri și cheltuieli', incomes: 'Venituri', expenses: 'Cheltuieli', savedIn: 'Economisit',
    byCategory: 'Pe categorii', byPerson: 'Pe persoană', netWorth: 'Avere netă', assets: 'Active (conturi)', liabilities: 'Datorii (credite)',
    // bugete și categorii
    budgets: 'Bugete lunare', budget: 'Buget lunar', noBudget: 'fără buget', categories: 'Categorii', newCategory: 'Categorie nouă',
    nameRo: 'Nume în română', nameRu: 'Nume în rusă', icon: 'Iconiță',
    // mai mult
    family: 'Familie și acces', ownerRole: 'Proprietar', fullAccess: 'Acces complet', personOnly: 'Persoană', noAccess: 'Doar în evidență, fără acces',
    invite: 'Invită prin Telegram', inviteText: 'Te invit în aplicația noastră de buget al familiei', inviteName: 'Cum se numește persoana invitată',
    inviteCreated: 'Trimite linkul persoanei. E valabil 7 zile și merge o singură dată.', copyLink: 'Copiază linkul', copied: 'Copiat',
    security: 'Doar conturile Telegram aprobate aici pot deschide aplicația. Fiecare intrare e verificată după semnătura Telegram.',
    removeAccess: 'Scoate accesul', removeAccessQ: (n) => `Scoți accesul pentru ${n}?`, addPerson: 'Adaugă persoană',
    notifications: 'Notificări de la bot', nLoans: 'Scadențe credite', nLoansSub: 'Cu 3 zile înainte și în ziua plății',
    nBudget: 'Buget depășit', nBudgetSub: 'La 80% și la 100%', nWeekly: 'Rezumat săptămânal', nWeeklySub: 'Duminică seara',
    nCar: 'Asigurare și revizie', nCarSub: 'Cu 30, 7 și 1 zi înainte', language: 'Limba', rates: 'Curs valutar', rateAuto: 'Se actualizează zilnic de la BNM. Poți scrie și manual.',
    assetsHint: 'Pune casa sau mașina ca un cont de tip „Depozit” dacă vrei să intre în averea netă.', person: 'Persoana', you: 'Tu',
    adult: 'Adult', child: 'Copil', color: 'Culoare', bunuri: 'Bunuri', bunuriSub: 'Casă, mașină, pentru avere netă',
  },
  ru: {
    home: 'Главная', accounts: 'Счета', reports: 'Отчёты', more: 'Ещё', add: 'Добавить',
    back: 'Назад', cancel: 'Отмена', save: 'Сохранить', delete: 'Удалить', edit: 'Изменить', all: 'Все', none: 'Нет',
    loading: 'Загрузка…', saved: 'Сохранено', error: 'Произошла ошибка. Попробуйте ещё раз.',
    openInTelegram: 'Откройте приложение в Telegram', openInTelegramText: 'Приложение работает только в Telegram, через семейного бота.',
    openBot: 'Открыть бота', notAllowed: 'Доступа пока нет', notAllowedText: 'Этот аккаунт Telegram не входит в семью. Попросите приглашение у того, кто создал приложение.',
    yourId: 'Ваш Telegram ID', inviteBad: 'Приглашение недействительно', inviteBadText: 'Ссылка истекла или уже использована. Попросите новую.',
    retry: 'Повторить',
    hello: 'Привет', availableAll: 'Доступно на всех счетах', month: 'Месяц', debts: 'Долги',
    monthBudget: 'Бюджет месяца', recentTx: 'Последние операции', noTx: 'Операций пока нет. Нажмите +, чтобы добавить первую.',
    loanDueIn: (n, d, a) => `${n}: ${a} к оплате ${d}`, inDays: (d) => d === 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} дн.`,
    left: (a) => `Осталось ${a} MDL`, over: (a) => `Превышено на ${a} MDL`, daysLeft: (d) => `${d} дн.`,
    newTx: 'Новая операция', editTx: 'Изменить операцию', expense: 'Расход', income: 'Доход', transfer: 'Перевод',
    amount: 'Сумма', category: 'Категория', who: 'Кто', fromAccount: 'Со счёта', toAccount: 'На счёт', account: 'Счёт',
    date: 'Дата', merchant: 'Магазин', note: 'Заметка', optional: 'Необязательно', receipt: 'Сфотографировать чек', receiptChange: 'Заменить фото чека',
    receiptRemove: 'Убрать чек', saveExpense: 'Сохранить расход', saveIncome: 'Сохранить доход', saveTransfer: 'Сохранить перевод',
    amountReceived: 'Полученная сумма', car: 'Машина', fuel: 'Заправка', liters: 'Литры', odometer: 'Пробег', fullTank: 'Полный бак',
    carPart: 'Для машины', carService: 'Сервис', carOther: 'Другое', deleteTxQ: 'Удалить операцию?', amountRequired: 'Введите сумму',
    accountRequired: 'Выберите счёт', transactions: 'Операции', search: 'Поиск', bon: 'чек',
    addAccount: 'Счёт', newAccount: 'Новый счёт', editAccount: 'Изменить счёт', totalMdl: 'Всего, в пересчёте на MDL',
    cards: 'Карты', cash: 'Наличные', deposits: 'Депозиты и сбережения', credits: 'Кредиты', activeLoans: (n) => `Активных кредитов: ${n}`,
    toPay: 'к погашению', name: 'Название', type: 'Тип', currency: 'Валюта', owner: 'Чей', common: 'Общий', bank: 'Банк',
    last4: 'Последние 4 цифры', openingBalance: 'Текущий остаток', interest: 'Ставка, % годовых', maturity: 'Срок депозита',
    archive: 'В архив', rateNote: (c, r) => `Курс: 1 ${c} = ${r} MDL`, deleteAccountQ: 'Удалить счёт? Можно только если нет операций.',
    cantDeleteAccount: 'У счёта есть операции. Отправьте его в архив.',
    remaining: 'Осталось выплатить', monthlyRates: 'Платежи в месяц', mortgage: 'Ипотека', consumer: 'Потребительский кредит',
    perYear: 'годовых', until: 'до', balanceLeft: 'Остаток долга', paidOf: (p, t) => `Выплачено ${p}% из ${t}`, ratesOf: (a, b) => `${a} из ${b} платежей`,
    due: 'Дата', payment: 'Платёж', principalShort: 'Долг', interestShort: 'Проценты', markPaid: 'Отметить оплату', fullSchedule: 'Весь график',
    newLoan: 'Новый кредит', editLoan: 'Изменить кредит', principal: 'Сумма кредита', termMonths: 'Срок, мес.', firstDue: 'Первый платёж (дата)',
    paidBefore: 'Уже оплачено платежей', monthlyPayment: 'Платёж по договору', monthlyPaymentHint: 'Оставьте пустым — рассчитается автоматически',
    payFrom: 'Оплата со счёта', payConfirm: (a, c) => `Записать платёж ${a} ${c}?`, paid: 'Оплачен', noLoans: 'Кредитов пока нет.',
    closeLoan: 'Закрыть кредит', closed: 'закрыт', loanPaid: 'Платёж записан',
    carTitle: 'Машина', newCar: 'Добавить машину', carName: 'Марка и модель', plate: 'Номер', startKm: 'Текущий пробег', kmOnBoard: 'км пробег',
    per100: 'на 100 км', thisMonth: 'MDL в этом мес.', deadlines: 'Сроки', refuels: 'Заправки', serviceRepairs: 'Сервис и ремонт',
    addEvent: 'Добавить срок', eventKind: 'Что истекает', rca: 'ОСАГО (RCA)', casco: 'КАСКО', inspection: 'Техосмотр', serviceDue: 'Плановый сервис',
    dueDate: 'Дата', dueKm: 'При пробеге', expiresIn: (t, d) => `${t} истекает ${d}`, kmLeft: (k) => `осталось ${k} км`, perYearShort: 'в год',
    markDone: 'Готово', noCar: 'Добавьте машину, чтобы следить за бензином, сервисом и страховками.',
    week: 'Неделя', year: 'Год', incomeVsExpense: 'Доходы и расходы', incomes: 'Доходы', expenses: 'Расходы', savedIn: 'Сэкономлено',
    byCategory: 'По категориям', byPerson: 'По людям', netWorth: 'Чистые активы', assets: 'Активы (счета)', liabilities: 'Долги (кредиты)',
    budgets: 'Бюджеты на месяц', budget: 'Бюджет в месяц', noBudget: 'без бюджета', categories: 'Категории', newCategory: 'Новая категория',
    nameRo: 'Название (рум.)', nameRu: 'Название (рус.)', icon: 'Иконка',
    family: 'Семья и доступ', ownerRole: 'Владелец', fullAccess: 'Полный доступ', personOnly: 'Участник', noAccess: 'Только учёт, без доступа',
    invite: 'Пригласить через Telegram', inviteText: 'Приглашаю в наше приложение семейного бюджета', inviteName: 'Как зовут приглашённого',
    inviteCreated: 'Отправьте ссылку. Она действует 7 дней и один раз.', copyLink: 'Копировать ссылку', copied: 'Скопировано',
    security: 'Открыть приложение могут только одобренные здесь аккаунты Telegram. Каждый вход проверяется по подписи Telegram.',
    removeAccess: 'Убрать доступ', removeAccessQ: (n) => `Убрать доступ для ${n}?`, addPerson: 'Добавить человека',
    notifications: 'Уведомления бота', nLoans: 'Платежи по кредитам', nLoansSub: 'За 3 дня и в день платежа',
    nBudget: 'Превышение бюджета', nBudgetSub: 'При 80% и 100%', nWeekly: 'Итоги недели', nWeeklySub: 'В воскресенье вечером',
    nCar: 'Страховка и техосмотр', nCarSub: 'За 30, 7 и 1 день', language: 'Язык', rates: 'Курс валют', rateAuto: 'Обновляется ежедневно по НБМ. Можно ввести вручную.',
    assetsHint: 'Добавьте дом или машину как счёт типа «Депозит», чтобы учесть их в активах.', person: 'Человек', you: 'Вы',
    adult: 'Взрослый', child: 'Ребёнок', color: 'Цвет', bunuri: 'Имущество', bunuriSub: 'Дом, машина — для чистых активов',
  },
}

export function t(key, ...args) {
  const v = D[lang.value][key] ?? D.ro[key] ?? key
  return typeof v === 'function' ? v(...args) : v
}

export const catName = (c) => (c ? (lang.value === 'ru' ? c.name_ru : c.name_ro) : '')
