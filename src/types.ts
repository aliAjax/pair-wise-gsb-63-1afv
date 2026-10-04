export type InspectionStatus = '待检验' | '需整改' | '整改中' | '待复测' | '已关闭' | '停用'
export type RiskLevel = '低' | '中' | '高' | '紧急'
export type CheckResult = '正常' | '异常' | '不适用'
export type ReleaseState = '未放行' | '待核' | '已放行' | '失效'
export type ReplacementStatus = '生效' | '待核'
export type PartStatus = '在用' | '已拆下'
export type ReleaseStatus = '有效' | '失效' | '复核追加'

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
  partSerial?: string
  releaseState?: ReleaseState
  releaseBasis?: string
  version: number
  createdAt: string
  updatedAt: string
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

export interface DevicePart {
  serial: string
  partName: string
  deviceCode: string
  mountedAt: string
  source: '初始登记' | '换件登记'
  status: PartStatus
}

export interface ReplacementRecord {
  id: string
  deviceCode: string
  deviceName: string
  partName: string
  oldSerial: string
  newSerial: string
  stampedAt: string
  submittedAt: string
  operator: string
  status: ReplacementStatus
  note: string
}

export interface ReplacementDraft {
  deviceCode: string
  partName: string
  oldSerial: string
  newSerial: string
  stampedAt: string
  operator: string
  note: string
}

export interface ReleaseReview {
  at: string
  operator: string
  note: string
}

export interface ReleaseRecord {
  id: string
  recordId: string
  deviceCode: string
  shift: string
  partSerial: string
  basis: string
  status: ReleaseStatus
  releasedAt: string
  reviews: ReleaseReview[]
}
