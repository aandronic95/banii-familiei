import { createApp } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from './App.vue'
import './styles/app.css'
import './styles/components.css'

// Istoric în memorie: în Telegram nu avem bară de adresă, iar hash-ul URL-ului îl folosește Telegram.
const routes = [
  { path: '/', name: 'home', component: () => import('./views/Home.vue'), meta: { tab: true } },
  { path: '/accounts', name: 'accounts', component: () => import('./views/Accounts.vue'), meta: { tab: true } },
  { path: '/account/:id', name: 'account', component: () => import('./views/AccountForm.vue'), meta: { form: true } },
  { path: '/transactions', name: 'transactions', component: () => import('./views/Transactions.vue') },
  { path: '/tx/:id', name: 'tx', component: () => import('./views/TxForm.vue'), meta: { form: true } },
  { path: '/reports', name: 'reports', component: () => import('./views/Reports.vue'), meta: { tab: true } },
  { path: '/more', name: 'more', component: () => import('./views/More.vue'), meta: { tab: true } },
  { path: '/credits', name: 'credits', component: () => import('./views/Credits.vue') },
  { path: '/loan/:id', name: 'loan', component: () => import('./views/LoanForm.vue'), meta: { form: true } },
  { path: '/investments', name: 'investments', component: () => import('./views/Investments.vue') },
  { path: '/investment/:id', name: 'investment', component: () => import('./views/InvestmentForm.vue'), meta: { form: true } },
  { path: '/car', name: 'car', component: () => import('./views/Car.vue') },
  { path: '/car-edit/:id', name: 'carEdit', component: () => import('./views/CarForm.vue'), meta: { form: true } },
  { path: '/car-event/:id', name: 'carEvent', component: () => import('./views/CarEventForm.vue'), meta: { form: true } },
  { path: '/budgets', name: 'budgets', component: () => import('./views/Budgets.vue') },
  { path: '/category/:id', name: 'category', component: () => import('./views/CategoryForm.vue'), meta: { form: true } },
  { path: '/recurring', name: 'recurring', component: () => import('./views/Recurring.vue') },
  { path: '/recurring/:id', name: 'recurringForm', component: () => import('./views/RecurringForm.vue'), meta: { form: true } },
  { path: '/calendar', name: 'calendar', component: () => import('./views/Calendar.vue') },
  { path: '/debts', name: 'debts', component: () => import('./views/Debts.vue') },
  { path: '/debt/:id', name: 'debt', component: () => import('./views/DebtForm.vue'), meta: { form: true } },
  { path: '/goals', name: 'goals', component: () => import('./views/Goals.vue') },
  { path: '/goal/:id', name: 'goal', component: () => import('./views/GoalForm.vue'), meta: { form: true } },
  { path: '/import', name: 'import', component: () => import('./views/Import.vue'), meta: { form: true } },
  { path: '/apple-pay', name: 'applePay', component: () => import('./views/ApplePay.vue') },
  { path: '/family', name: 'family', component: () => import('./views/Family.vue') },
  { path: '/templates', name: 'templates', component: () => import('./views/Templates.vue') },
  { path: '/restore', name: 'restore', component: () => import('./views/Restore.vue'), meta: { form: true } },
  { path: '/history', name: 'history', component: () => import('./views/History.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createMemoryHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

createApp(App).use(router).mount('#app')
router.push('/')

// Copia aplicației pe telefon (unde e permis; în unele aplicații iOS nu e disponibil și nu e nicio problemă)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}))
}
