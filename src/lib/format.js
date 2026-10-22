import { lang } from './i18n.js'
import { privacy } from './privacy.js'
import { evalAmount, isExpression } from './calc.js'

// 48 250,00 — spațiu la mii, virgulă la zecimale (la fel în ro și ru)
export function money(n, decimals = 2) {
  if (privacy.value) return '•••'
  const v = Number(n) || 0
  const s = Math.abs(v).toFixed(decimals).split('.')
  const int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (v < 0 ? '−' : '') + int + (decimals ? ',' + s[1] : '')
}
export const money0 = (n) => money(n, 0)

export function signed(n, kind) {
  if (kind === 'income') return '+' + money(n)
  if (kind === 'expense') return '−' + money(n)
  return money(n)
}

// Acceptă și calcule simple: „150+35,5”, „3×120”
export function parseAmount(s) {
  if (typeof s === 'number') return s
  const v = evalAmount(s)
  return v !== null ? Math.round(v * 100) / 100 : 0
}
export { evalAmount, isExpression }

export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const MONTHS = {
  ro: ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
}
const MONTHS_FULL = {
  ro: ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
}
const MONTHS_SHORT = {
  ro: ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
}

export function dateShort(iso, withYear = false) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const today = todayISO()
  if (iso === today) return lang.value === 'ru' ? 'Сегодня' : 'Azi'
  const yest = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10)
  if (iso === yest) return lang.value === 'ru' ? 'Вчера' : 'Ieri'
  const showYear = withYear || y !== Number(today.slice(0, 4))
  return `${d} ${MONTHS[lang.value][m - 1]}${showYear ? ' ' + y : ''}`
}

export function dateLong(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[lang.value][m - 1]} ${y}`
}

export const monthName = (m) => MONTHS_FULL[lang.value][m]
export const monthShort = (m) => MONTHS_SHORT[lang.value][m]

export function daysUntil(iso) {
  return Math.round((Date.parse(iso) - Date.parse(todayISO())) / 86400000)
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
