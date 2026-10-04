import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { seedAudit, seedRecords, seedReleases, seedReplacements } from '../data/seed'
import { createOfflineInspection } from '../services/api'
import type {
  AuditEntry,
  InspectionDraft,
  InspectionRecord,
  InspectionStatus,
  PartReplacement,
  ReleaseRecord,
  ReplacementDraft
} from '../types'

const STORAGE_KEY = 'gsb63:inspection-platform'
const SNAPSHOT_KEY = 'gsb63:chain-snapshot'
const SCHEMA_VERSION = 2

interface PersistedState {
  schemaVersion: number
  records: InspectionRecord[]
  audit: AuditEntry[]
  replacements: PartReplacement[]
  releases: ReleaseRecord[]
}

/** 状态均为纯 JSON 数据，用 JSON 深拷贝避开响应式代理克隆问题 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    records: deepClone(seedRecords),
    audit: deepClone(seedAudit),
    replacements: deepClone(seedReplacements),
    releases: deepClone(seedReleases)
  }
}

/** 兼容旧版本持久化数据：补换件链字段，标记需要迁移 */
function normalizePersisted(parsed: Partial<PersistedState> | null): { state: PersistedState; needsMigration: boolean } {
  if (!parsed || !Array.isArray(parsed.records)) return { state: seedState(), needsMigration: false }
  const needsMigration = parsed.schemaVersion !== SCHEMA_VERSION
  // 旧版本记录可能没有部件字段，按部分数据处理后交给迁移流程
  const records = (parsed.records as Array<Partial<InspectionRecord>>).map((record) => ({
    partSerial: '',
    conclusionStatus: undefined as InspectionRecord['conclusionStatus'] | undefined,
    ...record
  })) as InspectionRecord[]
  return {
    state: {
      schemaVersion: SCHEMA_VERSION,
      records,
      audit: Array.isArray(parsed.audit) ? parsed.audit : deepClone(seedAudit),
      replacements: Array.isArray(parsed.replacements) ? parsed.replacements : deepClone(seedReplacements),
      releases: Array.isArray(parsed.releases) ? parsed.releases : deepClone(seedReleases)
    },
    needsMigration
  }
}

function readPersisted(): { state: PersistedState; needsMigration: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalizePersisted(raw ? JSON.parse(raw) : null)
  } catch {
    return { state: seedState(), needsMigration: false }
  }
}

export const useInspectionStore = defineStore('inspection', () => {
  const initial = readPersisted()
  const records = ref<InspectionRecord[]>(initial.state.records)
  const audit = ref<AuditEntry[]>(initial.state.audit)
  const replacements = ref<PartReplacement[]>(initial.state.replacements)
  const releases = ref<ReleaseRecord[]>(initial.state.releases)
  const keyword = ref('')
  const status = ref<InspectionStatus | '全部'>('全部')
  const area = ref('全部')
  const liveMessage = ref('本地实时通道已就绪')
  /** 保存失败恢复提示，在顶栏下展示 */
  const lastRecovery = ref('')
  /** 演示开关：下一次持久化强制失败，用于验证从最后一笔完整换件链恢复 */
  const failNextSave = ref(false)

  let restoring = false

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

  /** 每台设备当前唯一有效履历，总览、看板、审计共用这一条链 */
  const validChain = computed(() => {
    const map = new Map<string, PartReplacement>()
    for (const link of replacements.value) {
      if (link.status !== '有效') continue
      const existing = map.get(link.deviceCode)
      if (!existing || existing.stampedAt < link.stampedAt) map.set(link.deviceCode, link)
    }
    return map
  })

  const chainStats = computed(() => ({
    devices: validChain.value.size,
    pending: replacements.value.filter((item) => item.status === '待核').length,
    invalidated: records.value.filter((item) => item.conclusionStatus === '失效').length,
    recheck: releases.value.filter((item) => item.status === '待复核').length
  }))

  function snapshotState(): PersistedState {
    return deepClone({
      schemaVersion: SCHEMA_VERSION,
      records: records.value,
      audit: audit.value,
      replacements: replacements.value,
      releases: releases.value
    })
  }

  function restoreState(snapshot: PersistedState) {
    records.value = snapshot.records
    audit.value = snapshot.audit
    replacements.value = snapshot.replacements
    releases.value = snapshot.releases
  }

  function persistNow() {
    if (failNextSave.value) {
      failNextSave.value = false
      throw new Error('模拟保存失败')
    }
    const payload = JSON.stringify(snapshotState())
    localStorage.setItem(STORAGE_KEY, payload)
    // 最后一笔完整换件链快照，保存失败时从这里恢复
    localStorage.setItem(SNAPSHOT_KEY, payload)
  }

  /** 保存失败后从最后一笔完整换件链恢复 */
  function recoverLastGood(): boolean {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return false
    restoring = true
    try {
      restoreState(normalizePersisted(JSON.parse(raw)).state)
      lastRecovery.value = '保存失败，已从最后一笔完整换件链恢复'
      return true
    } catch {
      return false
    } finally {
      restoring = false
    }
  }

  watch([records, audit, replacements, releases], () => {
    if (restoring) return
    try {
      persistNow()
    } catch {
      if (recoverLastGood()) {
        // 用恢复后的完整链条覆盖存储，避免残留失败前的脏数据
        restoring = true
        try {
          persistNow()
        } catch {
          /* 存储仍不可写时保持内存中的快照状态 */
        } finally {
          restoring = false
        }
      }
    }
  }, { deep: true })

  function addAudit(recordId: string, action: string, operator: string, detail: string) {
    audit.value.unshift({
      id: `${recordId}-${Date.now()}-${audit.value.length}`,
      recordId,
      action,
      operator,
      detail,
      createdAt: new Date().toISOString()
    })
  }

  function addRecord(draft: InspectionDraft) {
    const record = createOfflineInspection(draft)
    const link = validChain.value.get(record.deviceCode)
    record.partSerial = link?.partSerial ?? ''
    record.conclusionStatus = link ? '有效' : '待核'
    records.value.unshift(record)
    addAudit(record.id, '创建检验记录', draft.inspector, link ? `新建设备班次检验任务，绑定部件 ${link.partSerial}` : '新建设备班次检验任务，设备暂无有效换件链，结论待核')
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

  /** 履历更新联动：未放行结论失效，已开放班次保留原依据并追加复核 */
  function cascadeChainUpdate(link: PartReplacement) {
    for (const record of records.value) {
      if (record.deviceCode !== link.deviceCode || record.conclusionStatus !== '有效') continue
      const released = releases.value.some((item) => item.inspectionId === record.id)
      if (released || record.status === '已关闭') continue
      record.conclusionStatus = '失效'
      record.version += 1
      record.updatedAt = new Date().toISOString()
      addAudit(record.id, '检验结论失效', '系统联动', `部件履历更新为 ${link.partSerial}（${link.id}），未放行结论需按新部件重新确认`)
    }
    for (const release of releases.value) {
      if (release.deviceCode !== link.deviceCode || release.status !== '已放行') continue
      release.status = '待复核'
      release.recheckNote = `部件已更换为 ${link.partSerial}（${link.id}，盖章 ${link.stampedAt.replace('T', ' ').slice(0, 16)}），原放行依据保留，待追加复核`
      addAudit(release.id, '放行班次追加复核', '系统联动', `${release.deviceName} ${release.shift} 保留原依据，换件后需复核`)
    }
  }

  /** 履历被降级待核时，所属设备未放行结论同步转待核 */
  function markDeviceConclusionsPending(deviceCode: string, reason: string) {
    for (const record of records.value) {
      if (record.deviceCode !== deviceCode || record.conclusionStatus !== '有效') continue
      if (record.status === '已关闭' || releases.value.some((item) => item.inspectionId === record.id)) continue
      record.conclusionStatus = '待核'
      record.version += 1
      record.updatedAt = new Date().toISOString()
      addAudit(record.id, '检验结论待核', '系统联动', reason)
    }
  }

  /**
   * 换件登记：同一部件同一时段只服务一台设备，以现场盖章时刻为准，
   * 后到记录待核且不覆盖先到结果；重复提交不新增履历；保存失败整体回滚。
   */
  function registerReplacement(draft: ReplacementDraft): { ok: boolean; message: string; record?: PartReplacement } {
    const duplicated = replacements.value.find((item) => item.idempotencyKey === draft.idempotencyKey)
    if (duplicated) return { ok: true, message: `重复提交已忽略，沿用履历 ${duplicated.id}`, record: duplicated }

    const deviceName = records.value.find((item) => item.deviceCode === draft.deviceCode)?.deviceName
      ?? replacements.value.find((item) => item.deviceCode === draft.deviceCode)?.deviceName
      ?? draft.deviceCode
    const record: PartReplacement = {
      id: `REP-${Date.now().toString().slice(-8)}`,
      partSerial: draft.partSerial,
      partName: draft.partName,
      deviceCode: draft.deviceCode,
      deviceName,
      stampedAt: draft.stampedAt,
      registeredAt: new Date().toISOString(),
      window: draft.window,
      operator: draft.operator,
      reason: draft.reason,
      status: '有效',
      idempotencyKey: draft.idempotencyKey
    }

    const before = snapshotState()
    try {
      const rivals = replacements.value.filter((item) => item.partSerial === record.partSerial && item.status === '有效')
      for (const rival of rivals) {
        if (rival.stampedAt <= record.stampedAt) {
          // 先到结果保留，后到记录待核
          record.status = '待核'
          record.conflictWith = rival.id
        } else {
          // 新登记盖章更早，原记录才是后到，降级待核但不删除
          rival.status = '待核'
          rival.conflictWith = record.id
          markDeviceConclusionsPending(rival.deviceCode, `部件履历 ${rival.id} 与 ${record.id} 盖章冲突，原履历待核`)
        }
      }
      if (record.status === '有效') {
        const previous = replacements.value.find((item) => item.deviceCode === record.deviceCode && item.status === '有效')
        if (previous) {
          previous.status = '已解除'
          previous.removedAt = record.stampedAt
          addAudit(previous.id, '部件履历解除', '系统联动', `部件 ${previous.partSerial} 由 ${record.id} 替换下线`)
        }
        replacements.value.unshift(record)
        cascadeChainUpdate(record)
        addAudit(record.id, '换件登记生效', record.operator, `部件 ${record.partSerial} 挂载至 ${record.deviceName}，盖章时刻 ${record.stampedAt.replace('T', ' ').slice(0, 16)}`)
      } else {
        replacements.value.unshift(record)
        addAudit(record.id, '换件登记待核', record.operator, `部件 ${record.partSerial} 与 ${record.conflictWith} 盖章冲突，同一时段只服务一台设备，后到记录待核`)
      }
      persistNow()
      return record.status === '有效'
        ? { ok: true, message: `换件登记 ${record.id} 已生效，相关结论已联动更新`, record }
        : { ok: true, message: `换件登记 ${record.id} 盖章时刻晚于 ${record.conflictWith}，已标记待核`, record }
    } catch {
      restoreState(before)
      lastRecovery.value = '保存失败，已从最后一笔完整换件链恢复'
      return { ok: false, message: '保存失败，已恢复至最后一笔完整换件链，请重新提交' }
    }
  }

  /** 撤回待核登记，不影响先到结果 */
  function withdrawReplacement(id: string) {
    const record = replacements.value.find((item) => item.id === id)
    if (!record || record.status !== '待核') return { ok: false, message: '仅待核登记可撤回' }
    record.status = '已解除'
    record.removedAt = new Date().toISOString()
    addAudit(id, '待核登记撤回', '当前用户', `部件 ${record.partSerial} 的冲突登记已撤回，先到结果 ${record.conflictWith ?? ''} 保持不变`)
    return { ok: true, message: `已撤回 ${id}` }
  }

  /** 按新部件重新确认：失效/待核结论重新绑定当前有效履历 */
  function reconfirmInspection(id: string) {
    const record = records.value.find((item) => item.id === id)
    if (!record) return { ok: false, message: '记录不存在' }
    const link = validChain.value.get(record.deviceCode)
    if (!link) return { ok: false, message: '设备暂无有效换件链，无法确认' }
    record.partSerial = link.partSerial
    record.conclusionStatus = '有效'
    record.version += 1
    record.updatedAt = new Date().toISOString()
    addAudit(id, '按新部件重新确认', '当前用户', `结论重新绑定部件 ${link.partSerial}（${link.id}）`)
    return { ok: true, message: `已按当前有效部件 ${link.partSerial} 重新确认` }
  }

  /** 班次放行：仅有效结论且部件与当前有效链条一致时可放行，重复提交不新增 */
  function releaseShift(id: string) {
    const record = records.value.find((item) => item.id === id)
    if (!record) return { ok: false, message: '记录不存在' }
    if (record.conclusionStatus !== '有效') return { ok: false, message: `结论${record.conclusionStatus}，不参与放行` }
    const link = validChain.value.get(record.deviceCode)
    if (!link || link.partSerial !== record.partSerial) return { ok: false, message: '部件与当前有效换件链不一致，禁止放行' }
    if (record.stopped) return { ok: false, message: '设备停用隔离中，禁止放行' }
    if (record.items.some((item) => item.result === '异常')) return { ok: false, message: '存在异常项，禁止放行' }
    const existing = releases.value.find((item) => item.inspectionId === id && item.shift === record.shift)
    if (existing) return { ok: true, message: `重复提交已忽略，沿用放行单 ${existing.id}` }
    const release: ReleaseRecord = {
      id: `REL-${Date.now().toString().slice(-8)}`,
      inspectionId: id,
      deviceCode: record.deviceCode,
      deviceName: record.deviceName,
      shift: record.shift,
      partSerial: record.partSerial,
      basis: `依据 ${id} 检验结论与部件 ${record.partSerial} 履历放行`,
      releasedAt: new Date().toISOString(),
      operator: '当前用户',
      status: '已放行'
    }
    releases.value.unshift(release)
    addAudit(release.id, '班次放行', '当前用户', `${record.deviceName} ${record.shift} 开放，${release.basis}`)
    return { ok: true, message: `已放行 ${record.deviceName} ${record.shift}` }
  }

  /** 已开放班次完成追加复核 */
  function confirmRecheck(releaseId: string, note: string) {
    const release = releases.value.find((item) => item.id === releaseId)
    if (!release) return { ok: false, message: '放行单不存在' }
    if (release.status !== '待复核') return { ok: false, message: '该班次无需复核' }
    release.status = '已放行'
    release.recheckNote = `${note}（复核于 ${new Date().toISOString().replace('T', ' ').slice(0, 16)}）`
    addAudit(releaseId, '换件复核完成', '当前用户', `${release.deviceName} ${release.shift}：${note}`)
    return { ok: true, message: '复核完成，班次维持放行' }
  }

  /** 旧检验数据升级：按设备补部件序列号，补不全标待核不参与放行 */
  function migrateLegacy(): { filled: number; pending: number } {
    let filled = 0
    let pending = 0
    for (const record of records.value) {
      if (record.partSerial) {
        if (!record.conclusionStatus) record.conclusionStatus = '有效'
        continue
      }
      if (record.conclusionStatus === '待核') continue
      const link = validChain.value.get(record.deviceCode)
      if (link) {
        record.partSerial = link.partSerial
        record.conclusionStatus = '有效'
        filled += 1
        addAudit(record.id, '旧数据升级补录', '系统迁移', `按设备补录部件序列号 ${link.partSerial}（${link.id}）`)
      } else {
        record.conclusionStatus = '待核'
        pending += 1
        addAudit(record.id, '旧数据升级待核', '系统迁移', '部件序列号补不全，标记待核，不参与放行')
      }
    }
    return { filled, pending }
  }

  function resetDemo() {
    restoreState(seedState())
    lastRecovery.value = ''
  }

  if (initial.needsMigration) migrateLegacy()

  return {
    records, audit, replacements, releases, keyword, status, area, liveMessage, lastRecovery, failNextSave,
    filtered, stats, validChain, chainStats,
    addRecord, updateRecord, transition,
    registerReplacement, withdrawReplacement, reconfirmInspection, releaseShift, confirmRecheck,
    migrateLegacy, recoverLastGood, resetDemo
  }
})
