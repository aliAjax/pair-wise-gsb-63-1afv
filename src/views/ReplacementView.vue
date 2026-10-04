<script setup lang="ts">
import { computed, h, reactive, watch } from 'vue'
import { NButton, NDataTable, NInput, NSelect, NTag, useMessage } from 'naive-ui'
import { useInspectionStore } from '../stores/inspection'
import type { ReplacementDraft } from '../types'

const store = useInspectionStore()
const message = useMessage()

const draft = reactive<ReplacementDraft>({
  deviceCode: '',
  partName: '',
  oldSerial: '',
  newSerial: '',
  stampedAt: '2026-09-29T08:30',
  operator: '周宁',
  note: ''
})

const deviceOptions = computed(() => store.deviceChain.map((node) => ({ label: `${node.deviceName} / ${node.deviceCode}`, value: node.deviceCode })))
const valid = computed(() => draft.deviceCode && draft.partName && draft.newSerial && draft.stampedAt && draft.operator)

watch(() => draft.deviceCode, (code) => {
  const part = store.parts.find((item) => item.deviceCode === code && item.status === '在用')
  draft.oldSerial = part?.serial ?? ''
  if (part) draft.partName = part.partName
})

const fmt = (value: string) => value ? value.replace('T', ' ').slice(0, 16) : '—'

const replacementColumns = [
  { title: '登记号', key: 'id', width: 110 },
  { title: '设备', key: 'deviceName', width: 140, render: (row: any) => `${row.deviceName} / ${row.deviceCode}` },
  { title: '部件', key: 'partName', width: 100 },
  { title: '旧部件 → 新部件', key: 'newSerial', width: 240, render: (row: any) => `${row.oldSerial || '无'} → ${row.newSerial}` },
  { title: '盖章时刻', key: 'stampedAt', width: 130, render: (row: any) => fmt(row.stampedAt) },
  { title: '提交时刻', key: 'submittedAt', width: 130, render: (row: any) => fmt(row.submittedAt) },
  { title: '状态', key: 'status', width: 80, render: (row: any) => h(NTag, { type: row.status === '生效' ? 'success' : 'warning', bordered: false }, { default: () => row.status }) },
  { title: '备注', key: 'note', ellipsis: { tooltip: true } }
]

const partColumns = [
  { title: '部件序列号', key: 'serial', width: 160 },
  { title: '部件名称', key: 'partName', width: 110 },
  { title: '所属设备', key: 'deviceCode', width: 100 },
  { title: '装机时刻', key: 'mountedAt', width: 130, render: (row: any) => fmt(row.mountedAt) },
  { title: '来源', key: 'source', width: 90 },
  { title: '状态', key: 'status', width: 80, render: (row: any) => h(NTag, { type: row.status === '在用' ? 'success' : 'default', bordered: false }, { default: () => row.status }) }
]

const releaseColumns = [
  { title: '放行号', key: 'id', width: 110 },
  { title: '检验记录', key: 'recordId', width: 130 },
  { title: '设备', key: 'deviceCode', width: 90 },
  { title: '班次', key: 'shift', width: 70 },
  { title: '放行部件', key: 'partSerial', width: 150 },
  { title: '放行依据', key: 'basis', width: 200, ellipsis: { tooltip: true } },
  { title: '状态', key: 'status', width: 90, render: (row: any) => h(NTag, { type: row.status === '有效' ? 'success' : row.status === '复核追加' ? 'warning' : 'error', bordered: false }, { default: () => row.status }) },
  { title: '复核记录', key: 'reviews', render: (row: any) => row.reviews.length ? `${row.reviews.length} 次 · ${row.reviews[row.reviews.length - 1].note}` : '—' }
]

function submit() {
  if (!valid.value) return
  const result = store.registerReplacement({ ...draft })
  if (!result.ok) {
    message.error(result.message)
    return
  }
  if (result.record?.status === '待核') message.warning(result.message)
  else message.success(result.message)
  if (result.record?.status === '生效') {
    draft.newSerial = ''
    draft.note = ''
  }
}
</script>

<template>
  <section class="content replacement-layout">
    <div class="register-panel">
      <h3>换件登记</h3>
      <p class="panel-note">以现场盖章时刻为准；同一部件同一时段只服务一台设备，后到记录待核，不覆盖先到结果。重复提交不新增履历。</p>
      <label>设备
        <NSelect v-model:value="draft.deviceCode" :options="deviceOptions" placeholder="选择设备" />
      </label>
      <label>部件名称
        <NInput v-model:value="draft.partName" placeholder="例如 制动液压缸" />
      </label>
      <label>旧部件序列号
        <NInput v-model:value="draft.oldSerial" placeholder="当前在用部件，可留空" />
      </label>
      <label>新部件序列号
        <NInput v-model:value="draft.newSerial" placeholder="例如 BRK-AM014-2402" />
      </label>
      <label>现场盖章时刻
        <input v-model="draft.stampedAt" class="native-date" type="datetime-local" />
      </label>
      <label>经办人
        <NInput v-model:value="draft.operator" />
      </label>
      <label>备注
        <NInput v-model:value="draft.note" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="换件原因、现场情况" />
      </label>
      <NButton type="primary" block :disabled="!valid" @click="submit">提交换件登记</NButton>
      <p class="panel-note conflict-hint">提示：登记已在其他设备在用的部件序列号，可演示“后到待核”冲突处理。</p>
    </div>

    <div class="chain-panel">
      <div>
        <h3>换件登记链</h3>
        <NDataTable :columns="replacementColumns" :data="store.replacements" :bordered="false" size="small" :row-key="(row: any) => row.id" />
      </div>
      <div>
        <h3>部件履历</h3>
        <NDataTable :columns="partColumns" :data="store.parts" :bordered="false" size="small" :row-key="(row: any) => row.serial" />
      </div>
      <div>
        <h3>放行记录</h3>
        <NDataTable :columns="releaseColumns" :data="store.releases" :bordered="false" size="small" :row-key="(row: any) => row.id" />
      </div>
    </div>
  </section>
</template>
