<script setup>
// Ghidul din aplicație: folosire, instalare pentru altă familie, actualizare (cu verificarea versiunii)
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { GUIDE, UPSTREAM, rich } from '../lib/guide.js'
import { BUILD, isUpstream, updateStatus } from '../lib/version.js'
import { t, lang } from '../lib/i18n.js'
import { dateShort } from '../lib/format.js'
import { openLink } from '../lib/telegram.js'
import Icon from '../components/Icon.vue'

const route = useRoute()
const sections = computed(() => GUIDE[lang.value] || GUIDE.ro)
const open = ref(String(route.query.s || 'use'))
const toggle = (id) => { open.value = open.value === id ? '' : id }

const ver = ref({ state: 'loading', latest: null, news: [] })
async function check(fresh = false) {
  ver.value = { ...ver.value, state: 'loading' }
  try { ver.value = await updateStatus({ fresh }) } catch (_) { ver.value = { state: 'error', latest: null, news: [] } }
}
onMounted(() => check())
const shortSha = (s) => (s || '').slice(0, 7)
const repoUrl = computed(() => (BUILD.repo ? `https://github.com/${BUILD.repo}` : `https://github.com/${UPSTREAM}`))

// Linkurile din text se deschid în afara Telegram
function onClick(e) {
  const a = e.target.closest('a[data-ext]')
  if (!a) return
  e.preventDefault()
  openLink(a.getAttribute('href'))
}
</script>

<template>
  <main class="page" @click="onClick">
    <h1 class="h-title">{{ t('guideTitle') }}</h1>

    <div class="bf-card stack" aria-live="polite">
      <div class="kv"><span class="muted">{{ t('verYours') }}</span><b>{{ BUILD.sha ? shortSha(BUILD.sha) : t('verDev') }}<span v-if="BUILD.date" class="cap"> · {{ dateShort(BUILD.date.slice(0, 10), true) }}</span></b></div>
      <p v-if="ver.state === 'loading'" class="hint" style="margin: 0;">{{ t('verChecking') }}</p>
      <template v-else-if="isUpstream()">
        <p class="hint" style="margin: 0;">{{ t('verUpstream') }}</p>
      </template>
      <template v-else-if="ver.state === 'current'">
        <p style="margin: 0; color: var(--income); font-weight: 600;">✓ {{ t('verCurrent') }}</p>
      </template>
      <template v-else-if="ver.state === 'behind'">
        <p style="margin: 0; color: var(--warning); font-weight: 600;">{{ t('verBehind', dateShort(ver.latest.date.slice(0, 10), true)) }}</p>
        <div v-if="ver.news.length" class="stack" style="gap: 4px;">
          <span class="lbl">{{ t('verNews') }}</span>
          <div v-for="c in ver.news.slice(0, 8)" :key="c.sha" class="cap">• {{ c.title }}</div>
        </div>
        <button type="button" class="bf-btn bf-btn--primary" @click="open = 'update'">{{ t('verHow') }}</button>
      </template>
      <p v-else class="hint" style="margin: 0;">{{ t('verUnknown') }}</p>
      <button v-if="ver.state !== 'loading'" type="button" class="link" style="padding: 0; justify-self: start;" @click="check(true)">{{ t('verRecheck') }}</button>
    </div>

    <section v-for="s in sections" :key="s.id" class="bf-card stack">
      <button type="button" class="kv" style="all: unset; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 10px;" :aria-expanded="open === s.id" @click="toggle(s.id)">
        <span style="display: flex; gap: 10px; align-items: center;"><Icon :name="s.icon" /><b style="font-size: 17px;">{{ s.title }}</b></span>
        <span class="muted" aria-hidden="true">{{ open === s.id ? '▴' : '▾' }}</span>
      </button>
      <div v-if="open === s.id" class="guide stack">
        <template v-for="(b, i) in s.parts" :key="i">
          <h2 v-if="b.h" class="h-sec" style="margin-top: 6px;">{{ b.h }}</h2>
          <p v-else-if="b.p" v-html="rich(b.p)"></p>
          <ol v-else-if="b.steps"><li v-for="(x, j) in b.steps" :key="j" v-html="rich(x)"></li></ol>
          <ul v-else-if="b.list"><li v-for="(x, j) in b.list" :key="j" v-html="rich(x)"></li></ul>
          <p v-else-if="b.tip" class="bf-banner" style="background: var(--brand-soft);" v-html="rich(b.tip)"></p>
        </template>
        <button v-if="s.id === 'update' && !isUpstream()" type="button" class="bf-btn bf-btn--primary" @click="openLink(repoUrl)"><Icon name="upload" />{{ t('verOpenRepo') }}</button>
        <button v-if="s.id === 'install'" type="button" class="bf-btn bf-btn--secondary" @click="openLink(`https://github.com/${UPSTREAM}`)">{{ t('guideOpenUpstream') }}</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.guide p, .guide ol, .guide ul { margin: 0; line-height: 1.5; }
.guide ol, .guide ul { padding-left: 22px; display: grid; gap: 6px; }
.guide :deep(code) { font-size: 0.92em; background: var(--surface-2); padding: 1px 5px; border-radius: 6px; word-break: break-all; }
.guide :deep(a) { color: var(--brand); font-weight: 600; }
</style>
