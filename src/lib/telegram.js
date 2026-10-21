// Mic strat peste Telegram.WebApp, cu valori sigure când aplicația e deschisă în afara Telegram.
export const tg = window.Telegram?.WebApp

export const inTelegram = () => !!(tg && tg.initData)

export function initTelegram(onTheme) {
  if (!tg) return
  tg.ready()
  tg.expand?.()
  try { tg.disableVerticalSwipes?.() } catch (_) {}
  const apply = () => onTheme(tg.colorScheme === 'dark' ? 'dark' : 'light')
  apply()
  tg.onEvent?.('themeChanged', apply)
}

export function setChrome(bg) {
  try {
    tg?.setHeaderColor?.(bg)
    tg?.setBackgroundColor?.(bg)
    tg?.setBottomBarColor?.(bg)
  } catch (_) {}
}

export function haptic(kind = 'light') {
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') tg?.HapticFeedback?.notificationOccurred(kind)
    else tg?.HapticFeedback?.impactOccurred(kind)
  } catch (_) {}
}

export function confirmDialog(text) {
  return new Promise((resolve) => {
    if (tg?.showConfirm && tg.isVersionAtLeast?.('6.2')) tg.showConfirm(text, (ok) => resolve(!!ok))
    else resolve(window.confirm(text))
  })
}

export function alertDialog(text) {
  if (tg?.showAlert && tg.isVersionAtLeast?.('6.2')) tg.showAlert(text)
  else window.alert(text)
}

let backHandler = null
export function setBack(show, handler) {
  const b = tg?.BackButton
  if (!b) return
  if (backHandler) b.offClick(backHandler)
  backHandler = null
  if (show) {
    backHandler = handler
    b.onClick(handler)
    b.show()
  } else b.hide()
}

export function shareLink(url, text) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  if (tg?.openTelegramLink) tg.openTelegramLink(share)
  else window.open(share, '_blank')
}

export const BOT_USERNAME = 'andronicfambot'
