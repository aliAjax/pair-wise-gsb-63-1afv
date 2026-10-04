<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NButton, NDataTable, NInput, NModal, NSelect, NTag, useMessage } from 'naive-ui'
import { useInspectionStore } from '../stores/inspection'
import { devices } from '../data/seed'
import type { ChainLinkStatus, ConclusionStatus, PartReplacement, ReleaseRecord } from '../types'

const store = useInspectionStore()
const message = useMessage()

const windowOptions = ['一号窗口', '二号窗口'].map((value) => ({ label: value, value }))
const deviceOptions = devices.map((item) => ({ label: `${item.name} / ${item.code}`, value: item.code }))

function localNow() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function newDraft() {
  return {
    partSerial: '',
    partName: '',
    deviceCode: 'AM-014',
    stampedAt: localNow(),
    window: '一号窗口',
    operator: '周宁',
    reason: '',
    idempotencyKey: `REG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

const form = ref(newDraft())
const validForm = computed(() => form.value.partSerial.trim() && form.value.partName.trim() && form.value.deviceCode && form.value.stampedAt)

function submit() {
  if (!validForm.value) return
  const result = store.registerReplacement({
    ...form.value,
    partSerial: form.value.partSerial.trim(),
    partName: form.value.partName.trim(),
    stampedAt: form.value.stampedAt.length === 16 ? `${form.value.stampedAt}:00` : form.value.stampedAt
  })
  result.ok ? message.success(result.message) : message.error(result.message)
  // 生效或待核都重置表单并更换幂等键；判定为重复提交时保留原表单
  if (result.ok && !result.message.includes('重复提交')) form.value = newDraft()
}

/** 模拟两个窗口同时提交同一部件：盖章时刻决定先后，后到待核 */
function simulateConcurrency() {
  const serial = `SIM-${Date.now().toString().slice(-6)}`
  const now = Date.now()
  const pad = (value: number) => String(value).padStart(2, '0')
  const fmt = (time: number) => {
    const date = new Date(time)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  }
  const first = store.registerReplacement({
    partSerial: serial, partName: '模拟安全锁止器', deviceCode: 'AM-014',
    stampedAt: fmt(now), window: '一号窗口', operator: '周宁', reason: '双窗口并发模拟',
    idempotencyKey: `SIM-A-${now}`
  })
  const second = store.registerReplacement({
    partSerial: serial, partName: '模拟安全锁止器', deviceCode: 'WF-003',
    stampedAt: fmt(now - 10 * 60 * 1000), window: '二号窗口', operator: '赵帆', reason: '双窗口并发模拟',
    idempotencyKey: `SIM-B-${now}`
  })
  message.warning(`一号窗口（盖章晚）：${first.message}`)
  message.success(`二号窗口（盖章早 10 分钟）：${second.message}`)
}

function runMigration() {
  const result = store.migrateLegacy()
  message.success(`旧数据升级完成：补录部件序列号 ${result.filled} 笔，补不全标待核 ${result.pending} 笔`)
}

function runRecover() {
  store.recoverLastGood()
    ? message.success('已从最后一笔完整换件链恢复')
    : message.warning('暂无可用快照，尚未形成完整换件链')
}

const linkTagType: Record<ChainLinkStatus, 'success' | 'warning' | 'default'> = { 有效: 'success', 待核: 'warning', 已解除: 'default' }
const conclusionTagType: Record<ConclusionStatus, 'success' | 'warning' | 'error'> = { 有效: 'success', 待核: 'warning', 失效: 'error' }
const fmtTime = (value?: string) => value ? value.replace('T', ' ').slice(0, 16) : '—'

const sortedLinks = computed(() => [...store.replacements].sort((a, b) => b.stampedAt.localeCompare(a.stampedAt)))
const pendingLinks = computed(() => store.replacements.filter((item) => item.status === '待核'))
const invalidRecords = computed(() => store.records.filter((item) => item.conclusionStatus !== '有效'))

const linkColumns = [
  { title: '登记号', key: 'id', width: 120 },
  { title: '设备', key: 'deviceName', width: 140, render: (row: PartReplacement) => `${row.deviceName} / ${row.deviceCode}` },
  { title: '部件', key: 'partName', width: 150, render: (row: PartReplacement) => `${row.partName}（${row.partSerial}）` },
  { title: '盖章时刻', key: 'stampedAt', width: 130, render: (row: PartReplacement) => fmtTime(row.stampedAt) },
  { title: '登记窗口', key: 'window', width: 90 },
  { title: '状态', key: 'status', width: 90, render: (row: PartReplacement) => h(NTag, { size: 'small', bordered: false, type: linkTagType[row.status] }, { default: () => row.status }) },
  { title: '冲突/解除', key: 'conflictWith', width: 150, render: (row: PartReplacement) => row.conflictWith ? `与 ${row.conflictWith} 冲突` : row.removedAt ? `解除于 ${fmtTime(row.removedAt)}` : '—' },
  {
    title: '操作', key: 'actions', width: 90,
    render: (row: PartReplacement) => row.status === '待核'
      ? h(NButton, { size: 'tiny', tertiary: true, onClick: () => { const r = store.withdrawReplacement(row.id); r.ok ? message.success(r.message) : message.error(r.message) } }, { default: () => '撤回' })
      : null
  }
]

const recheckTarget = ref<ReleaseRecord | null>(null)
const recheckNote = ref('')
function openRecheck(release: ReleaseRecord) {
  recheckTarget.value = release
  recheckNote.value = ''
}
function submitRecheck() {
  if (!recheckTarget.value || !recheckNote.value.trim()) return
  const result = store.confirmRecheck(recheckTarget.value.id, recheckNote.value.trim())
  result.ok ? message.success(result.message) : message.error(result.message)
  recheckTarget.value = null
}

const releaseColumns = [
  { title: '放行单', key: 'id', width: 120 },
  { title: '设备 / 班次', key: 'deviceName', width: 150, render: (row: ReleaseRecord) => `${row.deviceName} · ${row.shift}` },
  { title: '依据部件', key: 'partSerial', width: 130, render: (row: ReleaseRecord) => row.partSerial || '（旧数据缺失）' },
  { title: '放行依据', key: 'basis', render: (row: ReleaseRecord) => row.basis },
  { title: '状态', key: 'status', width: 90, render: (row: ReleaseRecord) => h(NTag, { size: 'small', bordered: false, type: row.status === '已放行' ? 'success' : 'warning' }, { default: () => row.status }) },
  { title: '复核说明', key: 'recheckNote', width: 220, render: (row: ReleaseRecord) => row.recheckNote ?? '—' },
  {
    title: '操作', key: 'actions', width: 100,
    render: (row: ReleaseRecord) => row.status === '待复核'
      ? h(NButton, { size: 'tiny', tertiary: true, onClick: () => openRecheck(row) }, { default: () => '追加复核' })
      : null
  }
]
</script>

<template>
  <section class="content">
    <div class="metric-strip">
      <article><span>有效换件链</span><strong>{{ store.chainStats.devices }}</strong><small>台设备部件履历有效</small></article>
      <article><span>待核登记</span><strong>{{ store.chainStats.pending }}</strong><small>盖章冲突，不覆盖先到结果</small></article>
      <article><span>失效结论</span><strong>{{ store.chainStats.invalidated }}</strong><small>换件后需按新部件重新确认</small></article>
      <article><span>待复核放行</span><strong>{{ store.chainStats.recheck }}</strong><small>已开放班次保留原依据</small></article>
    </div>

    <div class="chain-grid">
      <div class="chain-card">
        <h3>换件登记</h3>
        <p class="card-tip">同一部件同一时段只服务一台设备，以现场盖章时刻为准，后到记录自动待核。</p>
        <div class="chain-form">
          <label>部件序列号 *<NInput v-model:value="form.partSerial" placeholder="例如 BRK-2026-0114" /></label>
          <label>部件名称 *<NInput v-model:value="form.partName" placeholder="例如 制动卡钳总成" /></label>
          <label>挂载设备 *<NSelect v-model:value="form.deviceCode" :options="deviceOptions" /></label>
          <label>现场盖章时刻 *<input v-model="form.stampedAt" class="native-date" type="datetime-local" /></label>
          <label>登记窗口<NSelect v-model:value="form.window" :options="windowOptions" /></label>
          <label>登记人<NInput v-model:value="form.operator" /></label>
          <label class="span-2">换件原因<NInput v-model:value="form.reason" placeholder="磨损超限 / 缺陷换件 / 寿命到期…" /></label>
        </div>
        <div class="chain-actions">
          <NButton type="primary" :disabled="!validForm" @click="submit">提交换件登记</NButton>
          <NButton @click="simulateConcurrency">模拟双窗口并发登记</NButton>
          <span class="idem-key">幂等键 {{ form.idempotencyKey }}，重复点击不新增履历</span>
        </div>
        <div class="chain-actions">
          <NButton tertiary @click="runMigration">升级旧检验数据</NButton>
          <NButton tertiary @click="runRecover">从最后一笔完整链条恢复</NButton>
          <label class="fail-toggle"><input v-model="store.failNextSave" type="checkbox" /> 模拟下一次保存失败</label>
        </div>
      </div>

      <div class="chain-card">
        <h3>待核与冲突</h3>
        <p class="card-tip">后到登记不覆盖先到结果，核实后可撤回；先到记录保持有效。</p>
        <div v-if="pendingLinks.length" class="pending-list">
          <article v-for="link in pendingLinks" :key="link.id">
            <header><strong>{{ link.partSerial }} → {{ link.deviceName }}</strong><NTag size="small" type="warning" :bordered="false">待核</NTag></header>
            <p>{{ link.window }} · 盖章 {{ fmtTime(link.stampedAt) }} · 与 {{ link.conflictWith }} 冲突</p>
          </article>
        </div>
        <div v-else class="kanban-empty">暂无待核登记</div>

        <h3 class="gap-top">失效 / 待核结论</h3>
        <p class="card-tip">部件履历更新后，未放行结论失效；待核结论不参与放行。</p>
        <div v-if="invalidRecords.length" class="pending-list">
          <article v-for="record in invalidRecords" :key="record.id">
            <header>
              <strong>{{ record.deviceName }} · {{ record.id }}</strong>
              <NTag size="small" :type="conclusionTagType[record.conclusionStatus]" :bordered="false">结论{{ record.conclusionStatus }}</NTag>
            </header>
            <p>当前部件：{{ record.partSerial || '未绑定' }} · 有效链条：{{ store.validChain.get(record.deviceCode)?.partSerial ?? '无' }}</p>
            <NButton size="tiny" tertiary @click="() => { const r = store.reconfirmInspection(record.id); r.ok ? message.success(r.message) : message.error(r.message) }">按新部件重新确认</NButton>
          </article>
        </div>
        <div v-else class="kanban-empty">全部结论与有效链条一致</div>
      </div>
    </div>

    <div class="chain-card">
      <h3>部件履历链</h3>
      <NDataTable :columns="linkColumns" :data="sortedLinks" :bordered="false" :row-key="(row: PartReplacement) => row.id" size="small" />
    </div>

    <div class="chain-card">
      <h3>放行记录</h3>
      <NDataTable :columns="releaseColumns" :data="store.releases" :bordered="false" :row-key="(row: ReleaseRecord) => row.id" size="small" />
    </div>

    <NModal :show="recheckTarget !== null" preset="card" title="换件后追加复核" style="width: 480px" @update:show="recheckTarget = null">
      <p class="card-tip">{{ recheckTarget?.deviceName }} {{ recheckTarget?.shift }} 保留原放行依据，复核通过后维持放行。</p>
      <NInput v-model:value="recheckNote" type="textarea" placeholder="复核结论，例如：新部件安装到位，试运行正常" />
      <template #footer>
        <div class="modal-actions">
          <NButton @click="recheckTarget = null">取消</NButton>
          <NButton type="primary" :disabled="!recheckNote.trim()" @click="submitRecheck">确认复核</NButton>
        </div>
      </template>
    </NModal>
  </section>
</template>
