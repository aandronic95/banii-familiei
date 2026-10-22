// Face ID / amprentă prin Telegram BiometricManager (Bot API 7.2+)
import { tg } from './telegram.js'

const bm = () => tg?.BiometricManager
export const lockSupported = () => !!(tg?.isVersionAtLeast?.('7.2') && bm())

export function initBio() {
  return new Promise((resolve) => {
    const b = bm()
    if (!b) return resolve(null)
    if (b.isInited) return resolve(b)
    try { b.init(() => resolve(b)) } catch (_) { resolve(null) }
  })
}

export async function bioState() {
  if (!lockSupported()) return { available: false, granted: false }
  const b = await initBio()
  return { available: !!b?.isBiometricAvailable, granted: !!b?.isAccessGranted }
}

export async function requestBio(reason) {
  const b = await initBio()
  if (!b?.isBiometricAvailable) return false
  if (b.isAccessGranted) return true
  return new Promise((resolve) => { try { b.requestAccess({ reason }, (ok) => resolve(!!ok)) } catch (_) { resolve(false) } })
}

export async function authenticate(reason) {
  const b = await initBio()
  if (!b?.isBiometricAvailable || !b.isAccessGranted) return false
  return new Promise((resolve) => { try { b.authenticate({ reason }, (ok) => resolve(!!ok)) } catch (_) { resolve(false) } })
}

export function openBioSettings() { try { bm()?.openSettings() } catch (_) {} }
