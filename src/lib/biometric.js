// Blocare cu Face ID / amprentă prin Telegram BiometricManager (Bot API 7.2+)
import { tg } from './telegram.js'

const KEY = 'bf-lock'
const bm = () => tg?.BiometricManager

export const lockSupported = () => !!(tg?.isVersionAtLeast?.('7.2') && bm())

export const isLockEnabled = () => { try { return localStorage.getItem(KEY) === '1' } catch (_) { return false } }
function setEnabled(on) { try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY) } catch (_) {} }

export function initBio() {
  return new Promise((resolve) => {
    const b = bm()
    if (!b) return resolve(null)
    if (b.isInited) return resolve(b)
    try { b.init(() => resolve(b)) } catch (_) { resolve(null) }
  })
}

export async function bioState() {
  const b = await initBio()
  return { available: !!b?.isBiometricAvailable, granted: !!b?.isAccessGranted, requested: !!b?.isAccessRequested, type: b?.biometricType || 'unknown' }
}

export async function authenticate(reason) {
  const b = await initBio()
  if (!b?.isBiometricAvailable || !b.isAccessGranted) return false
  return new Promise((resolve) => { try { b.authenticate({ reason }, (ok) => resolve(!!ok)) } catch (_) { resolve(false) } })
}

export async function enableLock(reason) {
  const b = await initBio()
  if (!b?.isBiometricAvailable) return false
  if (!b.isAccessGranted) {
    const granted = await new Promise((resolve) => { try { b.requestAccess({ reason }, (ok) => resolve(!!ok)) } catch (_) { resolve(false) } })
    if (!granted) return false
  }
  const ok = await authenticate(reason)
  if (ok) setEnabled(true)
  return ok
}

export async function disableLock(reason) {
  // Oprirea cere și ea Face ID, ca să nu poată fi ocolită
  const st = await bioState()
  if (st.available && st.granted && !(await authenticate(reason))) return false
  setEnabled(false)
  return true
}

export function openBioSettings() { try { bm()?.openSettings() } catch (_) {} }
