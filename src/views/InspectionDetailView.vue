<script setup lang="ts">
import { computed, h, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NDataTable, NInput, NSelect, NTag, useDialog, useMessage } from 'naive-ui'
import { useInspectionStore } from '../stores/inspection'
import type { CheckResult, InspectionRecord, InspectionStatus } from '../types'

const route = useRoute()
const router = useRouter()
const store = useInspectionStore()
const message = useMessage()
const dialog = useDialog()
const record = computed(() => store.records.find((item) => item.id === route.params.id))
const form = reactive<Partial<InspectionRecord>>({})
const stopState = computed({
  get: () => form.stopped ? '停用隔离' : '正常开放',
  set: (value: string) => { form.stopped = value === '停用隔离' }
})

watch(record, (value) => {
  if (value) Object.assign(form, structuredClone(value))
}, { immediate: true })

const items = computed(() => record.value?.items ?? [])
const transitions: InspectionStatus[] = ['待检验', '需整改', '整改中', '待复测', '已关闭', '停用']
const deviceLink = computed(() => record.value ? store.validChain.get(record.value.deviceCode) : undefined)
const recordReleases = computed(() => store.releases.filter((item) => item.inspectionId === record.value?.id))

function reconfirm() {
  if (!record.value) return
  const result = store.reconfirmInspection(record.value.id)
  result.ok ? message.success(result.message) : message.error(result.message)
}

function release() {
  if (!record.value) return
  dialog.warning({
    title: `确认放行${record.value.deviceName} ${record.value.shift}`,
    content: '系统会校验结论有效性、部件与当前有效换件链一致性、停用状态和异常项。',
    positiveText: '确认放行',
    negativeText: '取消',
    onPositiveClick: () => {
      const result = store.releaseShift(record.value!.id)
      result.ok ? message.success(result.message) : message.error(result.message)
    }
  })
}

function save() {
  if (!record.value) return
  store.updateRecord(record.value.id, {
    assignedTo: form.assignedTo,
    dueDate: form.dueDate,
    risk: form.risk,
    stopped: form.stopped,
    items: form.items
  })
  message.success('检验记录已保存并生成新版本')
}

function changeStatus(next: InspectionStatus) {
  if (!record.value) return
  dialog.warning({
    title: `确认流转至${next}`,
    content: '系统会校验异常项、停用状态和复测要求，并写入操作审计。',
    positiveText: '确认流转',
    negativeText: '取消',
    onPositiveClick: () => {
      const result = store.transition(record.value!.id, next, `由${record.value!.status}流转至${next}`)
      result.ok ? message.success(result.message) : message.error(result.message)
    }
  })
}

const columns = [
  { title: '检验项', key: 'name', width: 130 },
  { title: '结果', key: 'result', width: 120, render: (row: any, index: number) => h(NSelect, { value: row.result, options: ['正常', '异常', '不适用'].map((value) => ({ label: value, value })), onUpdateValue: (value: CheckResult) => { row.result = value } }) },
  { title: '实测值', key: 'reading', width: 160, render: (row: any) => h(NInput, { value: row.reading, onUpdateValue: (value: string) => { row.reading = value } }) },
  { title: '判定标准', key: 'limit', width: 150 },
  { title: '备注', key: 'note', render: (row: any) => h(NInput, { value: row.note, onUpdateValue: (value: string) => { row.note = value } }) }
]

function exportRecord() {
  if (!record.value) return
  const blob = new Blob([JSON.stringify(record.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${record.value.id}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section v-if="record" class="content detail-layout">
    <div class="detail-main">
      <div class="section-head">
        <div>
          <p>{{ record.deviceCode }} · {{ record.area }} · {{ record.shift }}</p>
          <h2>{{ record.deviceName }}</h2>
        </div>
        <div class="head-actions">
          <NTag :type="record.stopped ? 'error' : record.status === '已关闭' ? 'success' : 'warning'" :bordered="false">{{ record.stopped ? '设备已停用' : record.status }}</NTag>
          <NButton @click="exportRecord">导出记录</NButton>
          <NButton type="primary" @click="save">保存新版本</NButton>
        </div>
      </div>

      <div class="form-band">
        <label>整改责任人 <NInput v-model:value="form.assignedTo" /></label>
        <label>截止日期 <input v-model="form.dueDate" class="native-date" type="date" /></label>
        <label>风险等级 <NSelect v-model:value="form.risk" :options="['低', '中', '高', '紧急'].map((value) => ({ label: value, value }))" /></label>
        <label>设备状态 <NSelect v-model:value="stopState" :options="['正常开放', '停用隔离'].map((value) => ({ label: value, value }))" /></label>
      </div>

      <h3>逐项检验结果</h3>
      <NDataTable :columns="columns" :data="items" :bordered="false" size="small" />

      <div class="evidence-panel">
        <div><strong>现场证据</strong><span>{{ record.evidenceCount }} 张照片 · 最近上传 09:31</span></div>
        <div class="evidence-list"><span>锁止间隙近景</span><span>设备铭牌</span><span>制动测试仪表</span><button @click="record.evidenceCount += 1; message.success('已模拟上传现场照片')">上传照片</button></div>
      </div>

      <div class="chain-panel">
        <div class="chain-panel-head">
          <h3>部件履历与放行</h3>
          <NTag :type="record.conclusionStatus === '有效' ? 'success' : record.conclusionStatus === '待核' ? 'warning' : 'error'" :bordered="false">结论{{ record.conclusionStatus }}</NTag>
        </div>
        <div class="chain-facts">
          <div><span>检验绑定部件</span><strong>{{ record.partSerial || '未绑定' }}</strong></div>
          <div><span>设备当前有效部件</span><strong>{{ deviceLink?.partSerial ?? '无有效履历' }}</strong></div>
          <div><span>有效履历</span><strong>{{ deviceLink ? `${deviceLink.id} · 盖章 ${deviceLink.stampedAt.replace('T', ' ').slice(0, 16)}` : '—' }}</strong></div>
        </div>
        <p v-if="record.conclusionStatus === '失效'" class="chain-warning">部件履历已更新，本检验结论失效，需按新部件重新确认后才可放行。</p>
        <p v-else-if="record.conclusionStatus === '待核'" class="chain-warning">部件序列号待核，本记录不参与放行。</p>
        <div class="chain-panel-actions">
          <NButton v-if="record.conclusionStatus !== '有效'" size="small" @click="reconfirm">按新部件重新确认</NButton>
          <NButton size="small" type="primary" :disabled="record.conclusionStatus !== '有效'" @click="release">放行本班次</NButton>
        </div>
        <div v-if="recordReleases.length" class="release-list">
          <div v-for="item in recordReleases" :key="item.id" class="release-row">
            <span>{{ item.id }} · {{ item.shift }}</span>
            <NTag size="small" :type="item.status === '已放行' ? 'success' : 'warning'" :bordered="false">{{ item.status }}</NTag>
            <small>{{ item.recheckNote ?? item.basis }}</small>
          </div>
        </div>
      </div>
    </div>

    <aside class="detail-side">
      <div>
        <span class="side-label">当前流程</span>
        <strong>{{ record.status }}</strong>
        <small>版本 V{{ record.version }} · 更新于 {{ record.updatedAt.replace('T', ' ').slice(0, 16) }}</small>
      </div>
      <div class="flow-list">
        <button v-for="status in transitions" :key="status" :class="{ active: status === record.status }" @click="changeStatus(status)">
          <span>{{ status }}</span><small>{{ status === record.status ? '当前状态' : '执行流转' }}</small>
        </button>
      </div>
      <div class="rule-note">
        <strong>闭环校验</strong>
        <p>异常项存在时禁止关闭；紧急风险必须先停用设备。部件履历更新后未放行结论失效，放行以当前有效换件链为准。所有操作均写入审计。</p>
      </div>
      <NButton block @click="router.push('/audit')">查看完整审计</NButton>
    </aside>
  </section>
  <section v-else class="content empty-state">未找到检验记录</section>
</template>
