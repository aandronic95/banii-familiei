// Blocarea aplicației: cod de rezervă (verificat pe server) + Face ID opțional
import { supabase } from './supabase.js'
import { S } from '../store.js'

const KEY = 'bf-lock', BIO = 'bf-lock-bio'
const get = (k) => { try { return localStorage.getItem(k) === '1' } catch (_) { return false } }
const set = (k, on) => { try { on ? localStorage.setItem(k, '1') : localStorage.removeItem(k) } catch (_) {} }

export const isLockEnabled = () => get(KEY)
export const setLockEnabled = (on) => { set(KEY, on); if (!on) set(BIO, false) }
export const isBioEnabled = () => get(BIO)
export const setBioEnabled = (on) => set(BIO, on)

// Verificarea are nevoie de sesiune: așteaptă să se termine intrarea
async function ready() {
  for (let i = 0; i < 100 && S.status !== 'ready'; i++) await new Promise((r) => setTimeout(r, 150))
}

async function call(body) {
  await ready()
  const { data, error } = await supabase.functions.invoke('pin', { body })
  if (error) {
    let b = {}
    try { b = await error.context.json() } catch (_) {}
    return { ok: false, ...b, error: b.error || 'network' }
  }
  return data
}

export const pinStatus = () => call({ action: 'status' })
export const pinVerify = (pin) => call({ action: 'verify', pin })
export const pinSet = (pin, current) => call({ action: 'set', pin, current })
export const pinForgot = () => call({ action: 'forgot' })
export const pinReset = (code) => call({ action: 'reset', code })
