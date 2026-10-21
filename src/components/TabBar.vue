<script setup>
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { t } from '../lib/i18n.js'
import { haptic } from '../lib/telegram.js'

const route = useRoute()
const router = useRouter()
const tabs = [
  { to: '/', name: 'home', icon: 'home', match: ['home'] },
  { to: '/accounts', name: 'accounts', icon: 'card', match: ['accounts', 'account', 'transactions'] },
  null,
  { to: '/reports', name: 'reports', icon: 'chart', match: ['reports'] },
  { to: '/more', name: 'more', icon: 'dots', match: ['more', 'credits', 'loan', 'car', 'budgets', 'family'] },
]
const go = (to) => { haptic('light'); router.push(to) }
</script>

<template>
  <div class="screen-tabbar">
    <nav class="bf-tabbar">
      <template v-for="(tab, i) in tabs" :key="i">
        <button v-if="tab" type="button" class="bf-tab" :class="{ 'bf-tab--on': tab.match.includes(route.name) }" @click="go(tab.to)">
          <Icon :name="tab.icon" />{{ t(tab.name) }}
        </button>
        <button v-else type="button" class="bf-tab--add" :aria-label="t('newTx')" @click="go('/tx/new')">
          <Icon name="plus" :size="24" />
        </button>
      </template>
    </nav>
  </div>
</template>
