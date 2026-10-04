/* 换件链核心规则行为验证：在 node 中运行真实 store */
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

const mem = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear()
}

import { useInspectionStore } from '../src/stores/inspection'

async function main() {

let passed = 0
let failed = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`) }
  else { failed += 1; console.error(`  ✗ ${name} ${extra}`) }
}

setActivePinia(createPinia())
const store = useInspectionStore()
await nextTick()

console.log('1. 种子数据与同一有效链条')
check('3 台设备有有效履历', store.validChain.size === 3, `实际 ${store.validChain.size}`)
check('摩天轮旧记录待核不参与放行', store.records.find(r => r.id === 'INS-240821-04')!.conclusionStatus === '待核')
check('待核冲突登记已存在（BRK 挂两台设备）', store.replacements.some(r => r.id === 'REP-260926-01' && r.status === '待核' && r.conflictWith === 'REP-260920-01'))

console.log('2. 双窗口并发：以现场盖章时刻为准，后到待核不覆盖先到')
const t = Date.now()
const lateWindow = store.registerReplacement({
  partSerial: 'TEST-LOCK-01', partName: '测试锁止器', deviceCode: 'CR-021',
  stampedAt: '2026-10-04T10:00:00', window: '一号窗口', operator: '周宁', reason: '测试',
  idempotencyKey: `T1-${t}`
})
check('先提交的登记先生效', lateWindow.ok && lateWindow.record!.status === '有效')
check('旧履历被解除', store.replacements.find(r => r.id === 'REP-260922-01')!.status === '已解除')
check('已放行检验结论保留不失效', store.records.find(r => r.id === 'INS-240821-03')!.conclusionStatus === '有效')
check('已开放班次转待复核且保留原依据', store.releases.find(r => r.id === 'REL-260928-01')!.status === '待复核'
  && store.releases.find(r => r.id === 'REL-260928-01')!.basis.includes('INS-240821-03'))

const earlyWindow = store.registerReplacement({
  partSerial: 'TEST-LOCK-01', partName: '测试锁止器', deviceCode: 'WF-003',
  stampedAt: '2026-10-04T09:30:00', window: '二号窗口', operator: '赵帆', reason: '测试',
  idempotencyKey: `T2-${t}`
})
check('盖章更早的后到提交胜出', earlyWindow.ok && earlyWindow.record!.status === '有效')
check('盖章晚的先到记录被降级待核', lateWindow.record!.status === '待核' && lateWindow.record!.conflictWith === earlyWindow.record!.id)
check('有效履历仍是同一部件一条链', store.replacements.filter(r => r.partSerial === 'TEST-LOCK-01' && r.status === '有效').length === 1)

const laterSamePart = store.registerReplacement({
  partSerial: 'TEST-LOCK-01', partName: '测试锁止器', deviceCode: 'AM-014',
  stampedAt: '2026-10-04T11:00:00', window: '一号窗口', operator: '周宁', reason: '测试',
  idempotencyKey: `T3-${t}`
})
check('同部件更晚盖章直接待核', laterSamePart.record!.status === '待核')
check('先到结果未被覆盖', earlyWindow.record!.status === '有效' && store.validChain.get('WF-003')!.id === earlyWindow.record!.id)
check('被降级设备暂无有效履历', !store.validChain.has('CR-021'))
const orphanTask = store.addRecord({ deviceCode: 'CR-021', deviceName: '旋转木马', area: '亲子区', shift: '晚班', inspector: '王璟', risk: '低', assignedTo: '检验二组', dueDate: '2026-10-05' })
check('无有效链条设备新建任务结论待核', orphanTask.conclusionStatus === '待核' && orphanTask.partSerial === '')

console.log('3. 重复提交不新增履历')
const before = store.replacements.length
const dup = store.registerReplacement({
  partSerial: 'TEST-LOCK-02', partName: '测试锁止器', deviceCode: 'AM-014',
  stampedAt: '2026-10-04T12:00:00', window: '一号窗口', operator: '周宁', reason: '测试',
  idempotencyKey: `T4-${t}`
})
const dup2 = store.registerReplacement({
  partSerial: 'TEST-LOCK-02', partName: '测试锁止器', deviceCode: 'AM-014',
  stampedAt: '2026-10-04T12:00:00', window: '一号窗口', operator: '周宁', reason: '测试',
  idempotencyKey: `T4-${t}`
})
check('第二次提交判定为重复', dup2.message.includes('重复提交'))
check('履历数量只增加一笔', store.replacements.length === before + 1, `实际增加 ${store.replacements.length - before}`)

console.log('4. 保存失败从最后一笔完整换件链恢复')
const beforeFail = store.replacements.length
store.failNextSave = true
const failed1 = store.registerReplacement({
  partSerial: 'TEST-FAIL-01', partName: '故障件', deviceCode: 'RC-007',
  stampedAt: '2026-10-04T13:00:00', window: '二号窗口', operator: '李琪', reason: '测试',
  idempotencyKey: `T5-${t}`
})
check('保存失败返回失败', !failed1.ok)
check('状态回滚，履历未新增', store.replacements.length === beforeFail)
check('恢复提示已设置', store.lastRecovery.includes('最后一笔完整换件链'))
await nextTick()
check('回滚后重新提交可成功', store.registerReplacement({
  partSerial: 'TEST-FAIL-01', partName: '故障件', deviceCode: 'RC-007',
  stampedAt: '2026-10-04T13:00:00', window: '二号窗口', operator: '李琪', reason: '测试',
  idempotencyKey: `T5b-${t}`
}).ok)

console.log('5. 失效结论重新确认与放行校验')
const ins1 = store.records.find(r => r.id === 'INS-240821-01')!
check('AM-014 履历更新后 INS-01 结论失效', ins1.conclusionStatus === '失效')
check('失效结论禁止放行', !store.releaseShift('INS-240821-01').ok)
const reconfirm = store.reconfirmInspection('INS-240821-01')
check('按新部件重新确认', reconfirm.ok && ins1.conclusionStatus === '有效' && ins1.partSerial === 'TEST-LOCK-02')
ins1.items.forEach(i => { i.result = '正常' })
ins1.stopped = false
const rel = store.releaseShift('INS-240821-01')
check('确认后可放行', rel.ok, rel.message)
const relCount = store.releases.length
check('重复放行不新增放行单', store.releaseShift('INS-240821-01').message.includes('重复提交') && store.releases.length === relCount)

console.log('6. 已开放班次追加复核')
const recheckRel = store.releases.find(r => r.id === 'REL-260928-01')!
check('换件后班次为待复核', recheckRel.status === '待复核')
check('完成复核维持放行', store.confirmRecheck('REL-260928-01', '新部件安装到位，试运行正常').ok && recheckRel.status === '已放行')

console.log('6b. 履历被降级时未放行结论转待核')
const fresh = store.addRecord({ deviceCode: 'AM-014', deviceName: '高空飞翔', area: 'A区北侧', shift: '晚班', inspector: '周宁', risk: '低', assignedTo: '维修一组', dueDate: '2026-10-05' })
check('有有效链条设备新建任务结论有效', fresh.conclusionStatus === '有效' && fresh.partSerial === 'TEST-LOCK-02')
const steal = store.registerReplacement({
  partSerial: 'TEST-LOCK-02', partName: '测试锁止器', deviceCode: 'WF-003',
  stampedAt: '2026-10-04T11:30:00', window: '二号窗口', operator: '赵帆', reason: '冲突测试',
  idempotencyKey: `T6-${t}`
})
check('盖章更早的冲突登记胜出', steal.record!.status === '有效')
check('AM-014 原履历降级待核', store.replacements.find(r => r.idempotencyKey === `T4-${t}`)!.status === '待核')
check('AM-014 未放行结论同步转待核', fresh.conclusionStatus === '待核')
check('待核结论禁止放行', !store.releaseShift(fresh.id).ok)

console.log('7. 旧数据升级：按设备补序列号，补不全标待核')
const legacy = store.records.find(r => r.id === 'INS-240821-02')!
legacy.partSerial = ''
legacy.conclusionStatus = '有效'
const mig = store.migrateLegacy()
check('按设备当前有效链条补录 1 笔', mig.filled === 1 && legacy.partSerial === store.validChain.get('RC-007')!.partSerial, `filled=${mig.filled} serial=${legacy.partSerial}`)
const orphan = store.records.find(r => r.id === 'INS-240821-04')!
check('补不全的记录保持待核', orphan.conclusionStatus === '待核' && orphan.partSerial === '')
check('待核记录不参与放行', !store.releaseShift('INS-240821-04').ok)

console.log('8. 审计完整性')
check('换件登记写入审计', store.audit.some(a => a.action === '换件登记生效'))
check('结论失效写入审计', store.audit.some(a => a.action === '检验结论失效'))
check('复核写入审计', store.audit.some(a => a.action === '换件复核完成'))
check('放行写入审计', store.audit.some(a => a.action === '班次放行'))

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed ? 1 : 0)
}

main()
