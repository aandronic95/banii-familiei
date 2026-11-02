// Ce versiune rulează și dacă depozitul original are una mai nouă (API-ul public GitHub, cu memorare 6 ore)
import { UPSTREAM, compareVersion } from './guide.js'

export const BUILD = {
  sha: import.meta.env.VITE_APP_SHA || '',
  date: import.meta.env.VITE_APP_DATE || '',
  repo: import.meta.env.VITE_REPO || '',
}
export const isUpstream = () => BUILD.repo.toLowerCase() === UPSTREAM.toLowerCase()
const KEY = 'bf-upstream'

export async function upstreamCommits({ fresh = false } = {}) {
  if (!fresh) {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (c && Date.now() - c.at < 6 * 3600000) return c.list
    } catch (_) {}
  }
  const r = await fetch(`https://api.github.com/repos/${UPSTREAM}/commits?sha=main&per_page=20`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error('github ' + r.status)
  const list = (await r.json()).map((c) => ({ sha: c.sha, date: c.commit?.committer?.date || '', title: String(c.commit?.message || '').split('\n')[0].slice(0, 160), url: c.html_url }))
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), list })) } catch (_) {}
  return list
}

// { state: 'current' | 'behind' | 'unknown', latest, news: commit-urile noi față de versiunea instalată }
export async function updateStatus(opts) {
  if (!BUILD.sha) return { state: 'unknown', latest: null, news: [] }
  const list = await upstreamCommits(opts)
  const latest = list[0] || null
  const state = compareVersion(BUILD, latest)
  const idx = list.findIndex((c) => c.sha.startsWith(BUILD.sha) || BUILD.sha.startsWith(c.sha))
  const news = state === 'behind' ? (idx >= 0 ? list.slice(0, idx) : list.filter((c) => !BUILD.date || Date.parse(c.date) > Date.parse(BUILD.date))) : []
  return { state, latest, news }
}
