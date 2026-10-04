import type { AuditEntry, DevicePart, InspectionItem, InspectionRecord, ReleaseRecord, ReplacementRecord } from '../types'

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
    items: standardItems(true), evidenceCount: 4, version: 3, createdAt: '2026-09-28T08:20:00', updatedAt: '2026-09-28T09:35:00'
  },
  {
    id: 'INS-240821-02', deviceCode: 'RC-007', deviceName: '家庭过山车', area: 'B区', shift: '早班', inspector: '李琪',
    inspectedAt: '2026-09-28T09:05:00', status: '整改中', risk: '中', stopped: false, assignedTo: '电气班组', dueDate: '2026-09-30',
    items: standardItems(true), evidenceCount: 2, version: 2, createdAt: '2026-09-28T09:05:00', updatedAt: '2026-09-28T11:10:00'
  },
  {
    id: 'INS-240821-03', deviceCode: 'CR-021', deviceName: '旋转木马', area: '亲子区', shift: '中班', inspector: '王璟',
    inspectedAt: '2026-09-27T15:40:00', status: '待复测', risk: '低', stopped: false, assignedTo: '检验二组', dueDate: '2026-09-29',
    items: standardItems(), evidenceCount: 3, version: 4, createdAt: '2026-09-27T15:40:00', updatedAt: '2026-09-28T10:25:00'
  },
  {
    id: 'INS-240821-04', deviceCode: 'WF-003', deviceName: '摩天轮', area: '湖景区', shift: '早班', inspector: '赵帆',
    inspectedAt: '2026-09-27T07:55:00', status: '已关闭', risk: '低', stopped: false, assignedTo: '维修二组', dueDate: '2026-09-28',
    items: standardItems(), evidenceCount: 5, version: 5, createdAt: '2026-09-27T07:55:00', updatedAt: '2026-09-28T16:20:00'
  }
]

export const seedAudit: AuditEntry[] = seedRecords.flatMap((record) => [
  { id: `${record.id}-A1`, recordId: record.id, action: '创建检验记录', operator: record.inspector, detail: `${record.deviceName}完成班前检验`, createdAt: record.createdAt },
  ...(record.version > 1 ? [{ id: `${record.id}-A${record.version}`, recordId: record.id, action: record.status, operator: '系统流转', detail: `记录更新至版本 V${record.version}`, createdAt: record.updatedAt }] : [])
])

// 部件履历：CR-021 暂无登记，用于演示旧数据升级时补不全序列号先标待核
export const seedParts: DevicePart[] = [
  { serial: 'BRK-AM014-1107', partName: '制动液压缸', deviceCode: 'AM-014', mountedAt: '2025-11-07T08:00:00', source: '初始登记', status: '已拆下' },
  { serial: 'BRK-AM014-2301', partName: '制动液压缸', deviceCode: 'AM-014', mountedAt: '2026-08-12T09:10:00', source: '换件登记', status: '在用' },
  { serial: 'LCK-RC007-1180', partName: '锁止压杠', deviceCode: 'RC-007', mountedAt: '2026-07-03T10:20:00', source: '初始登记', status: '在用' },
  { serial: 'DRV-WF003-0455', partName: '驱动减速机', deviceCode: 'WF-003', mountedAt: '2026-06-18T14:00:00', source: '初始登记', status: '在用' }
]

export const seedReplacements: ReplacementRecord[] = [
  {
    id: 'REP-260812-01', deviceCode: 'AM-014', deviceName: '高空飞翔', partName: '制动液压缸',
    oldSerial: 'BRK-AM014-1107', newSerial: 'BRK-AM014-2301',
    stampedAt: '2026-08-12T09:10:00', submittedAt: '2026-08-12T09:14:00',
    operator: '周宁', status: '生效', note: '制动响应迟滞，整体更换液压缸'
  }
]

export const seedReleases: ReleaseRecord[] = [
  {
    id: 'REL-260928-04', recordId: 'INS-240821-04', deviceCode: 'WF-003', shift: '早班',
    partSerial: 'DRV-WF003-0455', basis: '检验结论 V5 · 全部项目正常',
    status: '有效', releasedAt: '2026-09-28T16:20:00', reviews: []
  }
]
