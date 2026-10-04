<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NDataTable, NDatePicker, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NTag, useMessage } from 'naive-ui'
import { useQuery } from '@tanstack/vue-query'
import { useInspectionStore } from '../stores/inspection'
import { loadInspectionSnapshot } from '../services/api'
import type { InspectionDraft, RiskLevel } from '../types'

const store = useInspectionStore()
const router = useRouter()
const message = useMessage()
const showCreate = ref(false)
const draft = ref<InspectionDraft>({ deviceCode: '', deviceName: '', area: 'A区', shift: '早班', inspector: '周宁', risk: '中', assignedTo: '维修一组', dueDate: '2026-09-30' })

const { isFetching } = useQuery({
  queryKey: ['inspection-snapshot'],
  queryFn: () => loadInspectionSnapshot(store.records),
  staleTime: 60_000
})

const statusOptions = ['全部', '待检验', '需整改', '整改中', '待复测', '已关闭', '停用'].map((value) => ({ label: value, value }))
const areaOptions = ['全部', ...new Set(store.records.map((item) => item.area))].map((value) => ({ label: value, value }))
const riskOptions: Array<{ label: RiskLevel; value: RiskLevel }> = ['低', '中', '高', '紧急'].map((value) => ({ label: value as RiskLevel, value: value as RiskLevel }))

const columns = [
  { title: '检验编号', key: 'id', width: 145 },
  { title: '设备', key: 'deviceName', width: 130, render: (row: any) => `${row.deviceName} / ${row.deviceCode}` },
  { title: '区域', key: 'area', width: 90 },
  { title: '状态', key: 'status', width: 90, render: (row: any) => h(NTag, { type: row.stopped ? 'error' : row.status === '已关闭' ? 'success' : 'warning', bordered: false }, { default: () => row.status }) },
  { title: '放行', key: 'releaseState', width: 86, render: (row: any) => h(NTag, { type: row.releaseState === '已放行' ? 'success' : row.releaseState === '失效' ? 'error' : row.releaseState === '待核' ? 'warning' : 'default', bordered: false }, { default: () => row.releaseState ?? '未放行' }) },
  { title: '风险', key: 'risk', width: 80 },
  { title: '责任人', key: 'assignedTo', width: 105 },
  { title: '截止', key: 'dueDate', width: 110 },
  { title: '版本', key: 'version', width: 70, render: (row: any) => `V${row.version}` },
  { title: '', key: 'actions', width: 80, render: (row: any) => h(NButton, { size: 'small', tertiary: true, onClick: () => router.push(`/records/${row.id}`) }, { default: () => '打开' }) }
]

const riskType = (risk: RiskLevel) => risk === '紧急' ? 'error' : risk === '高' ? 'warning' : 'default'
const validDraft = computed(() => draft.value.deviceCode && draft.value.deviceName && draft.value.assignedTo && draft.value.dueDate)

function createRecord() {
  if (!validDraft.value) return
  const record = store.addRecord(draft.value)
  showCreate.value = false
  message.success(`已创建 ${record.id}`)
  router.push(`/records/${record.id}`)
}
</script>

<template>
  <section class="content">
    <div class="metric-strip">
      <article><span>今日检验任务</span><strong>{{ store.stats.total }}</strong><small>含复用演示记录</small></article>
      <article><span>停用设备</span><strong>{{ store.stats.blocked }}</strong><small>需优先核实隔离状态</small></article>
      <article><span>临近超期</span><strong>{{ store.stats.overdue }}</strong><small>按整改截止日计算</small></article>
      <article><span>已闭环</span><strong>{{ store.stats.closed }}</strong><small>异常项已复核完成</small></article>
    </div>

    <div class="toolbar">
      <NInput v-model:value="store.keyword" clearable placeholder="搜索设备、编号、检验员或责任人" />
      <NSelect v-model:value="store.status" :options="statusOptions" />
      <NSelect v-model:value="store.area" :options="areaOptions" />
      <NButton type="primary" @click="showCreate = true">新建检验任务</NButton>
      <span class="query-state">{{ isFetching ? '正在同步' : '本地数据已加载' }}</span>
    </div>

    <NDataTable :columns="columns" :data="store.filtered" :bordered="false" :row-key="(row: any) => row.id" size="small" />

    <div class="chain-strip">
      <header>
        <strong>换件链快照</strong>
        <span>总览、看板与审计展示同一有效链条，仅含生效换件与在用部件</span>
      </header>
      <div class="chain-nodes">
        <article v-for="node in store.deviceChain" :key="node.deviceCode">
          <b>{{ node.deviceName }}</b>
          <small>{{ node.deviceCode }}</small>
          <span v-if="node.part">在用部件 {{ node.part.serial }}</span>
          <span v-else class="pending">无在用部件 · 检验待核</span>
        </article>
      </div>
      <div class="chain-flags">
        <NTag v-if="store.chainStats.pendingReplacements" type="warning" :bordered="false">待核换件 {{ store.chainStats.pendingReplacements }}</NTag>
        <NTag v-if="store.chainStats.pendingRecords" type="warning" :bordered="false">待核检验 {{ store.chainStats.pendingRecords }}</NTag>
        <NTag v-if="store.chainStats.invalidated" type="error" :bordered="false">失效结论 {{ store.chainStats.invalidated }}</NTag>
        <NTag v-if="store.chainStats.reviewing" :bordered="false">追加复核 {{ store.chainStats.reviewing }}</NTag>
        <span v-if="!store.chainStats.pendingReplacements && !store.chainStats.pendingRecords && !store.chainStats.invalidated && !store.chainStats.reviewing" class="chain-clear">链条完整，无待核与失效项</span>
      </div>
    </div>

    <NModal v-model:show="showCreate" preset="card" title="新建日常检验任务" style="width: 620px">
      <NForm label-placement="left" label-width="92">
        <div class="form-grid">
          <NFormItem label="设备编号" required><NInput v-model:value="draft.deviceCode" placeholder="例如 RC-009" /></NFormItem>
          <NFormItem label="设备名称" required><NInput v-model:value="draft.deviceName" /></NFormItem>
          <NFormItem label="区域"><NSelect v-model:value="draft.area" :options="areaOptions.filter((item) => item.value !== '全部')" /></NFormItem>
          <NFormItem label="班次"><NSelect v-model:value="draft.shift" :options="['早班', '中班', '晚班'].map((value) => ({ label: value, value }))" /></NFormItem>
          <NFormItem label="检验员"><NInput v-model:value="draft.inspector" /></NFormItem>
          <NFormItem label="风险等级"><NSelect v-model:value="draft.risk" :options="riskOptions" /></NFormItem>
          <NFormItem label="整改责任"><NInput v-model:value="draft.assignedTo" /></NFormItem>
          <NFormItem label="截止日期"><NDatePicker v-model:formatted-value="draft.dueDate" value-format="yyyy-MM-dd" type="date" /></NFormItem>
        </div>
      </NForm>
      <template #footer>
        <div class="modal-actions">
          <span v-if="!validDraft" class="validation">设备编号、名称、责任人和截止日期必填</span>
          <NButton @click="showCreate = false">取消</NButton>
          <NButton type="primary" :disabled="!validDraft" @click="createRecord">创建并进入检验</NButton>
        </div>
      </template>
    </NModal>
  </section>
</template>
