import type { AuditEntry, InspectionItem, InspectionRecord, PartReplacement, ReleaseRecord } from '../types'

export const devices = [
  { code: 'AM-014', name: '高空飞翔', area: 'A区北侧' },
  { code: 'RC-007', name: '家庭过山车', area: 'B区' },
  { code: 'CR-021', name: '旋转木马', area: '亲子区' },
  { code: 'WF-003', name: '摩天轮', area: '湖景区' }
]

const standardItems = (abnormal = false): InspectionItem[] => [
  { id: 'wear', name: '结构磨损', result: abnormal ? '异常' : '正常', reading: abnormal ? '6.8 mm' : '2.1 mm', limit: '≤ 5.0 mm', note: abnormal ? '主支撑连接处磨损超限' : '' },
  { id: 'noise', name: '运行异响', result: '正常', reading: '68 dB', limit: '≤ 75 dB', note: '' },
  { id: 'brake', name: '制动装置', result: '正常', reading: '制动距离 2.3 m', limit: '≤ 3.0 m', note: '' },
  { id: 'lock', name: '锁止机构', result: abnormal ? '异常' : '正常', reading: abnormal ? '存在间隙' : '闭合可靠', limit: '无可见间隙', note: abnormal ? '安全压杠锁止存在回弹' : '' },
  { id: 'safety', name: '安全装置', result: '正常', reading: '联锁有效', limit: '动作可靠', note: '' }
]

export const seedRecords: InspectionRecord[] = [
  {
    id: 'INS-240821-01', deviceCode: 'AM-014', deviceName: '高空飞翔', area: 'A区北侧', shift: '早班', inspector: '周宁',
    inspectedAt: '2026-09-28T08:20:00', status: '需整改', risk: '高', stopped: true, assignedTo: '维修一组', dueDate: '2026-09-29',
    items: standardItems(true), evidenceCount: 4, partSerial: 'BRK-2026-0114', conclusionStatus: '有效',
    version: 3, createdAt: '2026-09-28T08:20:00', updatedAt: '2026-09-28T09:35:00'
  },
  {
    id: 'INS-240821-02', deviceCode: 'RC-007', deviceName: '家庭过山车', area: 'B区', shift: '早班', inspector: '李琪',
    inspectedAt: '2026-09-28T09:05:00', status: '整改中', risk: '中', stopped: false, assignedTo: '电气班组', dueDate: '2026-09-30',
    items: standardItems(true), evidenceCount: 2, partSerial: 'LCK-2026-0032', conclusionStatus: '有效',
    version: 2, createdAt: '2026-09-28T09:05:00', updatedAt: '2026-09-28T11:10:00'
  },
  {
    id: 'INS-240821-03', deviceCode: 'CR-021', deviceName: '旋转木马', area: '亲子区', shift: '中班', inspector: '王璟',
    inspectedAt: '2026-09-27T15:40:00', status: '待复测', risk: '低', stopped: false, assignedTo: '检验二组', dueDate: '2026-09-29',
    items: standardItems(), evidenceCount: 3, partSerial: 'SLE-2026-0007', conclusionStatus: '有效',
    version: 4, createdAt: '2026-09-27T15:40:00', updatedAt: '2026-09-28T10:25:00'
  },
  {
    id: 'INS-240821-04', deviceCode: 'WF-003', deviceName: '摩天轮', area: '湖景区', shift: '早班', inspector: '赵帆',
    inspectedAt: '2026-09-27T07:55:00', status: '已关闭', risk: '低', stopped: false, assignedTo: '维修二组', dueDate: '2026-09-28',
    items: standardItems(), evidenceCount: 5, partSerial: '', conclusionStatus: '待核',
    version: 5, createdAt: '2026-09-27T07:55:00', updatedAt: '2026-09-28T16:20:00'
  }
]

export const seedReplacements: PartReplacement[] = [
  {
    id: 'REP-260926-01', partSerial: 'BRK-2026-0114', partName: '制动卡钳总成', deviceCode: 'WF-003', deviceName: '摩天轮',
    stampedAt: '2026-09-26T16:40:00', registeredAt: '2026-09-26T16:44:00', window: '二号窗口', operator: '赵帆',
    reason: '临时调配登记', status: '待核', conflictWith: 'REP-260920-01', idempotencyKey: 'seed-rep-04'
  },
  {
    id: 'REP-260922-01', partSerial: 'SLE-2026-0007', partName: '回转支承', deviceCode: 'CR-021', deviceName: '旋转木马',
    stampedAt: '2026-09-22T10:15:00', registeredAt: '2026-09-22T10:20:00', window: '一号窗口', operator: '王璟',
    reason: '例行寿命到期更换', status: '有效', idempotencyKey: 'seed-rep-03'
  },
  {
    id: 'REP-260921-01', partSerial: 'LCK-2026-0032', partName: '安全压杠锁止器', deviceCode: 'RC-007', deviceName: '家庭过山车',
    stampedAt: '2026-09-21T14:30:00', registeredAt: '2026-09-21T14:41:00', window: '二号窗口', operator: '李琪',
    reason: '锁止回弹缺陷换件', status: '有效', idempotencyKey: 'seed-rep-02'
  },
  {
    id: 'REP-260920-01', partSerial: 'BRK-2026-0114', partName: '制动卡钳总成', deviceCode: 'AM-014', deviceName: '高空飞翔',
    stampedAt: '2026-09-20T09:00:00', registeredAt: '2026-09-20T09:06:00', window: '一号窗口', operator: '周宁',
    reason: '制动片磨损超限更换', status: '有效', idempotencyKey: 'seed-rep-01'
  },
  {
    id: 'REP-250512-01', partSerial: 'BRK-2025-0987', partName: '制动卡钳总成', deviceCode: 'AM-014', deviceName: '高空飞翔',
    stampedAt: '2025-05-12T08:30:00', registeredAt: '2025-05-12T08:40:00', window: '一号窗口', operator: '周宁',
    reason: '年度大修更换', status: '已解除', removedAt: '2026-09-20T09:00:00', idempotencyKey: 'seed-rep-00'
  }
]

export const seedReleases: ReleaseRecord[] = [
  {
    id: 'REL-260928-01', inspectionId: 'INS-240821-03', deviceCode: 'CR-021', deviceName: '旋转木马', shift: '中班',
    partSerial: 'SLE-2026-0007', basis: '依据 INS-240821-03 检验结论与部件 SLE-2026-0007 履历放行',
    releasedAt: '2026-09-28T11:00:00', operator: '王璟', status: '已放行'
  },
  {
    id: 'REL-260928-02', inspectionId: 'INS-240821-04', deviceCode: 'WF-003', deviceName: '摩天轮', shift: '早班',
    partSerial: '', basis: '旧数据放行，部件序列号缺失，待升级补录',
    releasedAt: '2026-09-28T08:10:00', operator: '赵帆', status: '已放行'
  }
]

export const seedAudit: AuditEntry[] = [
  ...seedRecords.flatMap((record) => [
    { id: `${record.id}-A1`, recordId: record.id, action: '创建检验记录', operator: record.inspector, detail: `${record.deviceName}完成班前检验`, createdAt: record.createdAt },
    ...(record.version > 1 ? [{ id: `${record.id}-A${record.version}`, recordId: record.id, action: record.status, operator: '系统流转', detail: `记录更新至版本 V${record.version}`, createdAt: record.updatedAt }] : [])
  ]),
  ...seedReplacements.map((link) => ({
    id: `${link.id}-A1`, recordId: link.id, action: link.status === '待核' ? '换件登记待核' : link.status === '已解除' ? '部件履历解除' : '换件登记生效',
    operator: link.operator,
    detail: link.status === '待核'
      ? `部件 ${link.partSerial} 与 ${link.conflictWith} 盖章冲突，同一时段只服务一台设备，后到记录待核`
      : `部件 ${link.partSerial} 挂载至 ${link.deviceName}，盖章时刻 ${link.stampedAt.replace('T', ' ').slice(0, 16)}`,
    createdAt: link.registeredAt
  })),
  ...seedReleases.map((release) => ({
    id: `${release.id}-A1`, recordId: release.id, action: '班次放行', operator: release.operator,
    detail: `${release.deviceName} ${release.shift} 开放，${release.basis}`, createdAt: release.releasedAt
  }))
]
