import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { seedAudit, seedParts, seedRecords, seedReleases, seedReplacements } from '../data/seed'
import { createOfflineInspection } from '../services/api'
import type {
  AuditEntry,
  DevicePart,
  InspectionDraft,
  InspectionRecord,
  InspectionStatus,
  ReleaseRecord,
  ReplacementDraft,
  ReplacementRecord
} from '../types'

const STORAGE_KEY = 'gsb63:inspection-platform'
const CHAIN_BACKUP_KEY = 'gsb63:replacement-chain-backup'

interface PersistedState {
  records: InspectionRecord[]
  audit: AuditEntry[]
  parts: DevicePart[]
  replacements: ReplacementRecord[]
  releases: ReleaseRecord[]
}

function seedState(): PersistedState {
  return {
    records: structuredClone(seedRecords),
    audit: structuredClone(seedAudit),
    parts: structuredClone(seedParts),
    replacements: structuredClone(seedReplacements),
    releases: structuredClone(seedReleases)
  }
}

function isValidState(value: unknown): value is PersistedState {
  const state = value as PersistedState
  return !!state && (['records', 'audit', 'parts', 'replacements', 'releases'] as const).every((key) => Array.isArray(state[key]))
}

// 旧检验数据升级：按设备补部件序列号，补不全先标待核不参与放行
function migrateLegacyRecords(state: PersistedState): PersistedState {
  state.records = state.records.map((record) => {
    if (record.releaseState) return record
    const part = state.parts.find((item) => item.deviceCode === record.deviceCode && item.status === '在用')
    if (!part) return { ...record, partSerial: '', releaseState: '待核' as const }
    const released = record.status === '已关闭'
    return {
      ...record,
      partSerial: part.serial,
      releaseState: released ? '已放行' as const : '未放行' as const,
      releaseBasis: released ? `历史结论 V${record.version} · 部件 ${part.serial}` : record.releaseBasis
    }
  })
  return state
}

function readPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isValidState(parsed)) return migrateLegacyRecords(parsed)
    }
  } catch { /* 主存档损坏时落到备份链 */ }
  // 保存失败后从最后一笔完整换件链恢复
  try {
    const backup = localStorage.getItem(CHAIN_BACKUP_KEY)
    if (backup) {
      const parsed = JSON.parse(backup)
      if (isValidState(parsed)) return migrateLegacyRecords(parsed)
    }
  } catch { /* 备份不可用时落到演示数据 */ }
  return migrateLegacyRecords(seedState())
}

export const useInspectionStore = defineStore('inspection', () => {
  const initial = readPersisted()
  const records = ref<InspectionRecord[]>(initial.records)
  const audit = ref<AuditEntry[]>(initial.audit)
  const parts = ref<DevicePart[]>(initial.parts)
  const replacements = ref<ReplacementRecord[]>(initial.replacements)
  const releases = ref<ReleaseRecord[]>(initial.releases)
  const keyword = ref('')
  const status = ref<InspectionStatus | '全部'>('全部')
  const area = ref('全部')
  const liveMessage = ref('本地实时通道已就绪')

  const filtered = computed(() => records.value.filter((record) => {
    const haystack = `${record.id} ${record.deviceCode} ${record.deviceName} ${record.inspector} ${record.assignedTo}`.toLowerCase()
    return (!keyword.value || haystack.includes(keyword.value.toLowerCase()))
      && (status.value === '全部' || record.status === status.value)
      && (area.value === '全部' || record.area === area.value)
  }))

  const stats = computed(() => ({
    total: records.value.length,
    blocked: records.value.filter((item) => item.stopped).length,
    overdue: records.value.filter((item) => item.dueDate < '2026-09-29' && !['已关闭'].includes(item.status)).length,
    closed: records.value.filter((item) => item.status === '已关闭').length
  }))

  const chainStats = computed(() => ({
    pendingReplacements: replacements.value.filter((item) => item.status === '待核').length,
    pendingRecords: records.value.filter((item) => item.releaseState === '待核').length,
    invalidated: records.value.filter((item) => item.releaseState === '失效').length,
    reviewing: releases.value.filter((item) => item.status === '复核追加').length
  }))

  // 总览、看板、审计共用的同一有效链条：只含生效换件与在用部件
  const deviceChain = computed(() => {
    const devices = new Map<string, string>()
    records.value.forEach((record) => devices.set(record.deviceCode, record.deviceName))
    parts.value.forEach((part) => { if (!devices.has(part.deviceCode)) devices.set(part.deviceCode, part.deviceCode) })
    return [...devices.entries()].map(([deviceCode, deviceName]) => ({
      deviceCode,
      deviceName,
      part: parts.value.find((item) => item.deviceCode === deviceCode && item.status === '在用'),
      replacements: replacements.value.filter((item) => item.deviceCode === deviceCode),
      releases: releases.value.filter((item) => item.deviceCode === deviceCode)
    }))
  })

  function snapshot(): PersistedState {
    return structuredClone({
      records: records.value,
      audit: audit.value,
      parts: parts.value,
      replacements: replacements.value,
      releases: releases.value
    })
  }

  function restore(state: PersistedState) {
    records.value = state.records
    audit.value = state.audit
    parts.value = state.parts
    replacements.value = state.replacements
    releases.value = state.releases
  }

  function persistChain() {
    try {
      localStorage.setItem(CHAIN_BACKUP_KEY, JSON.stringify(snapshot()))
    } catch { /* 备份写入失败不阻断现场操作 */ }
  }

  function addRecord(draft: InspectionDraft) {
    const record = createOfflineInspection(draft)
    const part = parts.value.find((item) => item.deviceCode === draft.deviceCode && item.status === '在用')
    record.partSerial = part?.serial ?? ''
    record.releaseState = part ? '未放行' : '待核'
    records.value.unshift(record)
    addAudit(record.id, '创建检验记录', draft.inspector, part ? `新建设备班次检验任务，挂在用部件 ${part.serial}` : '新建设备班次检验任务，部件序列号待核')
    return record
  }

  function updateRecord(id: string, patch: Partial<InspectionRecord>, action = '保存检验记录') {
    const record = records.value.find((item) => item.id === id)
    if (!record) return
    Object.assign(record, patch, { version: record.version + 1, updatedAt: new Date().toISOString() })
    addAudit(id, action, '当前用户', `记录更新至版本 V${record.version}`)
  }

  function transition(id: string, next: InspectionStatus, detail: string) {
    const record = records.value.find((item) => item.id === id)
    if (!record) return { ok: false, message: '记录不存在' }
    if (next === '已关闭' && record.items.some((item) => item.result === '异常')) {
      return { ok: false, message: '仍有异常项，不能关闭任务' }
    }
    if (next === '待复测' && !record.stopped && record.risk === '紧急') {
      return { ok: false, message: '紧急风险缺陷必须先执行停用' }
    }
    record.status = next
    record.version += 1
    record.updatedAt = new Date().toISOString()
    addAudit(id, `状态流转：${next}`, '当前用户', detail)
    return { ok: true, message: `已流转至${next}` }
  }

  // 换件登记：以现场盖章时刻为准，同一部件同一时段只服务一台设备
  function registerReplacement(draft: ReplacementDraft): { ok: boolean; message: string; record?: ReplacementRecord } {
    const before = snapshot()
    try {
      const now = new Date().toISOString()
      // 重复提交不新增履历
      const duplicate = replacements.value.find((item) => item.deviceCode === draft.deviceCode
        && item.newSerial === draft.newSerial && item.stampedAt === draft.stampedAt)
      if (duplicate) return { ok: true, message: `重复提交已忽略，沿用登记 ${duplicate.id}`, record: duplicate }

      const deviceName = records.value.find((item) => item.deviceCode === draft.deviceCode)?.deviceName ?? draft.deviceCode
      const entry: ReplacementRecord = { ...draft, id: `REP-${Date.now().toString().slice(-8)}`, deviceName, submittedAt: now, status: '生效' }

      // 后到记录待核，不覆盖先到结果
      const holder = parts.value.find((item) => item.serial === draft.newSerial && item.status === '在用'
        && item.deviceCode !== draft.deviceCode && item.mountedAt <= draft.stampedAt)
      const chained = replacements.value.find((item) => item.status === '生效' && item.newSerial === draft.newSerial
        && item.deviceCode !== draft.deviceCode && item.stampedAt <= draft.stampedAt)
      if (holder || chained) {
        const serving = holder?.deviceCode ?? chained?.deviceCode
        entry.status = '待核'
        entry.note = `${draft.note ? `${draft.note}；` : ''}部件 ${draft.newSerial} 在盖章时刻已服务于 ${serving}，后到登记待核`
        replacements.value.unshift(entry)
        addAudit(entry.id, '换件登记待核', draft.operator, `${deviceName} 登记部件 ${draft.newSerial} 与 ${serving} 在先链条冲突，不覆盖先到结果`)
        persistChain()
        return { ok: true, message: `部件 ${draft.newSerial} 在盖章时刻已服务 ${serving}，登记已标待核`, record: entry }
      }

      // 部件履历更新
      const oldPart = parts.value.find((item) => item.serial === draft.oldSerial && item.deviceCode === draft.deviceCode && item.status === '在用')
      if (oldPart) oldPart.status = '已拆下'
      parts.value.push({ serial: draft.newSerial, partName: draft.partName, deviceCode: draft.deviceCode, mountedAt: draft.stampedAt, source: '换件登记', status: '在用' })

      // 未放行的检验和复验结论失效，按新部件重新确认
      let invalidated = 0
      records.value.forEach((record) => {
        if (record.deviceCode !== draft.deviceCode) return
        if (record.releaseState === '未放行' || record.releaseState === '失效') {
          if (record.releaseState === '未放行') invalidated += 1
          record.releaseState = '失效'
          record.releaseBasis = `原部件 ${draft.oldSerial || '未登记'} 已拆下，结论失效，按新部件 ${draft.newSerial} 重新确认`
          record.version += 1
          record.updatedAt = now
        }
      })

      // 已开放班次保留原依据并追加复核
      let reviewed = 0
      releases.value.forEach((release) => {
        if (release.deviceCode !== draft.deviceCode || release.status === '失效') return
        release.status = '复核追加'
        release.reviews.push({ at: now, operator: draft.operator, note: `换件 ${draft.oldSerial || '无'} → ${draft.newSerial}，已开放班次保留原放行依据，追加复核` })
        reviewed += 1
      })

      replacements.value.unshift(entry)
      addAudit(entry.id, '换件登记生效', draft.operator, `${deviceName} ${draft.partName}：${draft.oldSerial || '无'} → ${draft.newSerial}，盖章时刻 ${draft.stampedAt.replace('T', ' ')}`)
      if (invalidated) addAudit(entry.id, '检验结论失效', '系统流转', `${invalidated} 笔未放行结论因部件履历更新失效，需按新部件重新确认`)
      if (reviewed) addAudit(entry.id, '放行追加复核', '系统流转', `${reviewed} 笔已开放班次保留原依据并追加复核`)
      persistChain()
      return { ok: true, message: '换件链已生效，部件履历与放行记录已联动更新', record: entry }
    } catch {
      restore(before)
      return { ok: false, message: '保存失败，已从最后一笔完整换件链恢复' }
    }
  }

  function releaseInspection(recordId: string, operator = '当前用户') {
    const record = records.value.find((item) => item.id === recordId)
    if (!record) return { ok: false, message: '记录不存在' }
    if (record.releaseState === '待核') return { ok: false, message: '部件序列号待核，不参与放行' }
    if (record.releaseState === '已放行') return { ok: false, message: '该班次已放行，请勿重复提交' }
    if (record.items.some((item) => item.result === '异常')) return { ok: false, message: '存在异常项，不能放行' }
    const part = parts.value.find((item) => item.deviceCode === record.deviceCode && item.status === '在用')
    if (!part) return { ok: false, message: '设备无在用部件，不能放行' }
    const now = new Date().toISOString()
    record.releaseState = '已放行'
    record.partSerial = part.serial
    record.releaseBasis = `检验结论 V${record.version} · 部件 ${part.serial}`
    record.updatedAt = now
    releases.value.unshift({
      id: `REL-${Date.now().toString().slice(-8)}`,
      recordId: record.id,
      deviceCode: record.deviceCode,
      shift: record.shift,
      partSerial: part.serial,
      basis: record.releaseBasis,
      status: '有效',
      releasedAt: now,
      reviews: []
    })
    addAudit(record.id, '班次放行', operator, `依据 ${record.releaseBasis} 开放 ${record.shift}`)
    persistChain()
    return { ok: true, message: `已按在用部件 ${part.serial} 放行` }
  }

  function addAudit(recordId: string, action: string, operator: string, detail: string) {
    audit.value.unshift({
      id: `${recordId}-${Date.now()}`,
      recordId,
      action,
      operator,
      detail,
      createdAt: new Date().toISOString()
    })
  }

  function resetDemo() {
    const state = migrateLegacyRecords(seedState())
    restore(state)
    persistChain()
  }

  watch([records, audit, parts, replacements, releases], () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()))
  }, { deep: true })

  return {
    records, audit, parts, replacements, releases,
    keyword, status, area, liveMessage,
    filtered, stats, chainStats, deviceChain,
    addRecord, updateRecord, transition, registerReplacement, releaseInspection, resetDemo
  }
})
