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
  { path: '/car', name: 'car', component: () => import('./views/Car.vue') },
  { path: '/car-edit/:id', name: 'carEdit', component: () => import('./views/CarForm.vue'), meta: { form: true } },
  { path: '/car-event/:id', name: 'carEvent', component: () => import('./views/CarEventForm.vue'), meta: { form: true } },
  { path: '/budgets', name: 'budgets', component: () => import('./views/Budgets.vue') },
  { path: '/category/:id', name: 'category', component: () => import('./views/CategoryForm.vue'), meta: { form: true } },
  { path: '/family', name: 'family', component: () => import('./views/Family.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createMemoryHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

createApp(App).use(router).mount('#app')
router.push('/')
