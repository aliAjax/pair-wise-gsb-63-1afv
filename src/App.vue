<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useInspectionStore } from './stores/inspection'
import { connectLiveUpdates } from './services/api'

const route = useRoute()
const store = useInspectionStore()
let disconnect: () => void = () => undefined

const pageTitle = computed(() => {
  if (route.name === 'defects') return '缺陷处置看板'
  if (route.name === 'chain') return '换件链管理'
  if (route.name === 'audit') return '检验审计'
  if (route.name === 'record') return '检验任务详情'
  return '日常检验总览'
})

onMounted(() => {
  disconnect = connectLiveUpdates((message) => { store.liveMessage = message })
})
onUnmounted(() => disconnect())
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">安</span>
        <div>
          <strong>游乐设施检验台</strong>
          <small>设备安全与缺陷闭环</small>
        </div>
      </div>
      <nav>
        <RouterLink to="/"><span>01</span>检验总览</RouterLink>
        <RouterLink to="/defects"><span>02</span>缺陷处置</RouterLink>
        <RouterLink to="/chain"><span>03</span>换件链</RouterLink>
        <RouterLink to="/audit"><span>04</span>操作审计</RouterLink>
      </nav>
      <div class="sidebar-status">
        <i />
        <div>
          <strong>{{ store.liveMessage }}</strong>
          <small>数据保存在本机浏览器</small>
        </div>
      </div>
    </aside>
    <main>
      <header class="topbar">
        <div>
          <p>设备安全运营中心 / 现场检验</p>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="session">
          <span>值班检验员</span>
          <strong>周宁</strong>
        </div>
      </header>
      <div v-if="store.lastRecovery" class="recovery-banner">
        <span>{{ store.lastRecovery }}</span>
        <button @click="store.lastRecovery = ''">知道了</button>
      </div>
      <RouterView />
    </main>
  </div>
</template>
