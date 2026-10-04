export type InspectionStatus = '待检验' | '需整改' | '整改中' | '待复测' | '已关闭' | '停用'
export type RiskLevel = '低' | '中' | '高' | '紧急'
export type CheckResult = '正常' | '异常' | '不适用'

/** 部件履历（换件登记）状态：有效 / 待核 / 已解除 */
export type ChainLinkStatus = '有效' | '待核' | '已解除'
/** 检验结论与当前有效换件链的关系 */
export type ConclusionStatus = '有效' | '待核' | '失效'
/** 放行记录状态：已放行 / 待复核（换件后保留原依据，追加复核） */
export type ReleaseStatus = '已放行' | '待复核'

export interface InspectionItem {
  id: string
  name: string
  result: CheckResult
  reading: string
  limit: string
  note: string
}

export interface InspectionRecord {
  id: string
  deviceCode: string
  deviceName: string
  area: string
  shift: string
  inspector: string
  inspectedAt: string
  status: InspectionStatus
  risk: RiskLevel
  stopped: boolean
  assignedTo: string
  dueDate: string
  items: InspectionItem[]
  evidenceCount: number
  /** 检验时设备挂载的部件序列号，旧数据可能为空串（待补录） */
  partSerial: string
  /** 结论是否仍对当前有效链条成立 */
  conclusionStatus: ConclusionStatus
  version: number
  createdAt: string
  updatedAt: string
}

/** 部件履历：一笔换件登记，把部件挂到设备上 */
export interface PartReplacement {
  id: string
  partSerial: string
  partName: string
  deviceCode: string
  deviceName: string
  /** 现场盖章时刻，冲突裁决的唯一依据 */
  stampedAt: string
  /** 登记提交时刻 */
  registeredAt: string
  window: string
  operator: string
  reason: string
  status: ChainLinkStatus
  /** 冲突的另一笔登记编号 */
  conflictWith?: string
  /** 被新履历解除的时刻 */
  removedAt?: string
  /** 幂等键：重复提交不新增履历 */
  idempotencyKey: string
}

/** 放行记录：某设备某班次依据检验结论与部件履历开放 */
export interface ReleaseRecord {
  id: string
  inspectionId: string
  deviceCode: string
  deviceName: string
  shift: string
  partSerial: string
  /** 原放行依据说明，换件后保留 */
  basis: string
  releasedAt: string
  operator: string
  status: ReleaseStatus
  recheckNote?: string
}

export interface ReplacementDraft {
  partSerial: string
  partName: string
  deviceCode: string
  stampedAt: string
  window: string
  operator: string
  reason: string
  idempotencyKey: string
}

export interface AuditEntry {
  id: string
  recordId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

export interface InspectionDraft {
  deviceCode: string
  deviceName: string
  area: string
  shift: string
  inspector: string
  risk: RiskLevel
  assignedTo: string
  dueDate: string
}
