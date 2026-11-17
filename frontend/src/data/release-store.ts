import { listRows } from './local-store'
import type { EntryRow } from './types'
import type {
  CompatManifest,
  ConflictReceipt,
  JointVerification,
  LateRevision,
  ReleaseModuleKey,
  ReleaseObject,
  ReleaseState,
  ReleaseWindow,
  ReviewChecklist,
  ReviewChecklistRow,
  WindowStrategy,
} from './release-types'

// 跨模块统一发布窗口：三个模块只共享一份冻结清单，状态整体落在 localStorage 里。
const RELEASE_KEY = 'behavior-event-trace-hub:release'

const MODULE_SPEC: Record<ReleaseModuleKey, { name: string; entity: string; code: string; nameField: string }> = {
  eventspec: { name: '事件规范', entity: '事件定义', code: '事件编号', nameField: '事件名称' },
  feature: { name: '特征工程', entity: '特征模板', code: '模板编号', nameField: '特征名称' },
  action: { name: '行动标签', entity: '标签规则', code: '规则编号', nameField: '标签名称' },
}

const MODULE_ORDER: ReleaseModuleKey[] = ['eventspec', 'feature', 'action']
const SIDES = ['事件功能发布治理（事件侧）', '事件功能发布治理（特征/标签侧）']

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowStamp(): string {
  return new Date().toISOString()
}

function hash(text: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, '0')
}

function digestOf(objects: ReleaseObject[]): string {
  const canonical = objects
    .map((item) => `${item.moduleKey}:${item.code}:${item.revision}:${item.status}`)
    .join('|')
  return hash(canonical)
}

function seedState(withDemo = true): ReleaseState {
  const revisions: Record<string, number> = {}
  for (const key of MODULE_ORDER) {
    for (const row of listRows(key)) {
      revisions[`${key}:${String(row[MODULE_SPEC[key].code])}`] = 1
    }
  }
  const base: ReleaseState = {
    seq: { window: 0, manifest: 0, receipt: 0, review: 0, late: 0 },
    windows: [],
    manifests: [],
    receipts: [],
    reviews: [],
    revisions,
    lateRevisions: [],
    pendingReview: [],
  }
  return withDemo ? seedDemoWindow(base) : base
}

// 演示窗口：首次打开就用 EVEN-0003 / FEAT-0003 / ACTI-0003 冻结一版，三个页面都读它。
const DEMO_WINDOW_KEY = 'WIN-EVEN-0003'
const DEMO_CODES: Record<ReleaseModuleKey, string> = {
  eventspec: 'EVEN-0003',
  feature: 'FEAT-0003',
  action: 'ACTI-0003',
}

function seedDemoWindow(base: ReleaseState): ReleaseState {
  const objects: ReleaseObject[] = []
  for (const moduleKey of MODULE_ORDER) {
    const spec = MODULE_SPEC[moduleKey]
    const code = DEMO_CODES[moduleKey]
    const row = listRows(moduleKey).find((item) => String(item[spec.code]) === code)
    if (!row) {
      return base
    }
    objects.push({
      moduleKey,
      moduleName: spec.name,
      entity: spec.entity,
      rowId: Number(row.id),
      code,
      name: String(row[spec.nameField] ?? ''),
      status: String(row.status),
      revision: 1,
    })
  }
  const stamp = '2026-11-17T08:00:00.000Z'
  const manifest: CompatManifest = {
    id: 'MFST-0001',
    windowKey: DEMO_WINDOW_KEY,
    version: 1,
    status: '已冻结',
    source: '首次发布',
    strategy: 'latest-complete',
    createdAt: stamp,
    createdBy: '演示发布者',
    objects,
    digest: digestOf(objects),
    verifications: buildJointVerification(objects),
  }
  const window: ReleaseWindow = {
    id: 'WIN-0001',
    windowKey: DEMO_WINDOW_KEY,
    status: '当前冻结',
    strategy: 'latest-complete',
    manifestId: manifest.id,
    objects,
    publisher: '演示发布者',
    frozenAt: stamp,
    note: '演示窗口：事件定义 / 特征模板 / 标签规则共享这一份冻结清单',
  }
  const [eventObject, featureObject, actionObject] = objects
  const review: ReviewChecklist = {
    id: 'RVW-0001',
    manifestId: manifest.id,
    windowId: window.id,
    windowKey: window.windowKey,
    version: manifest.version,
    generatedAt: stamp,
    status: '完整',
    rows: [
      {
        step: 1,
        flow: '事件定义 → 兼容发布清单',
        fromModule: '事件规范',
        fromCode: eventObject.code,
        toModule: eventObject.entity,
        toCode: manifest.id,
        check: '一致',
        detail: `从事件定义读到兼容发布清单 ${manifest.windowKey} v${manifest.version}，摘要 ${manifest.digest}`,
      },
      {
        step: 2,
        flow: '兼容发布清单 → 特征模板',
        fromModule: eventObject.moduleName,
        fromCode: eventObject.code,
        toModule: '特征工程',
        toCode: featureObject.code,
        check: '一致',
        detail: `特征模板经清单 ${manifest.id} v${manifest.version} 与事件定义对齐，修订 ${featureObject.revision}`,
      },
      {
        step: 3,
        flow: '兼容发布清单 → 标签规则',
        fromModule: eventObject.moduleName,
        fromCode: eventObject.code,
        toModule: '行动标签',
        toCode: actionObject.code,
        check: '一致',
        detail: `标签规则经清单 ${manifest.id} v${manifest.version} 与事件定义对齐，修订 ${actionObject.revision}`,
      },
      {
        step: 4,
        flow: '窗口 → 冻结版本',
        fromModule: '统一发布窗口',
        fromCode: window.id,
        toModule: '兼容发布清单',
        toCode: manifest.id,
        check: '一致',
        detail: `窗口 ${window.windowKey} 当前冻结版本指向 ${window.manifestId}`,
      },
    ],
  }
  base.seq = { window: 1, manifest: 1, receipt: 0, review: 1, late: 0 }
  base.manifests = [manifest]
  base.windows = [window]
  base.reviews = [review]
  return base
}

let cache: ReleaseState | null = null

function load(): ReleaseState {
  if (cache !== null) {
    return cache
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    cache = seedState()
    return cache
  }
  const raw = window.localStorage.getItem(RELEASE_KEY)
  if (!raw) {
    cache = seedState()
    return cache
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ReleaseState>
    const fallback = seedState()
    cache = {
      seq: { ...fallback.seq, ...(parsed.seq ?? {}) },
      windows: parsed.windows ?? [],
      manifests: parsed.manifests ?? [],
      receipts: parsed.receipts ?? [],
      reviews: parsed.reviews ?? [],
      revisions: { ...fallback.revisions, ...(parsed.revisions ?? {}) },      lateRevisions: parsed.lateRevisions ?? [],
      pendingReview: parsed.pendingReview ?? [],
    }
    return cache
  } catch {
    cache = seedState()
    return cache
  }
}

function persist(next: ReleaseState): void {
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(RELEASE_KEY, JSON.stringify(next))
  }
}

function nextId(kind: keyof ReleaseState['seq'], prefix: string): string {
  const state = load()
  state.seq[kind] += 1
  return `${prefix}-${String(state.seq[kind]).padStart(4, '0')}`
}

export function releaseState(): ReleaseState {
  return load()
}

export function moduleSpec(key: ReleaseModuleKey) {
  return MODULE_SPEC[key]
}

export function releaseRevisions(): Record<string, number> {
  return { ...load().revisions }
}

function buildObject(moduleKey: ReleaseModuleKey, code: string): ReleaseObject | null {
  const spec = MODULE_SPEC[moduleKey]
  const row = listRows(moduleKey).find((item) => String(item[spec.code]) === code)
  if (!row) {
    return null
  }
  const revision = load().revisions[`${moduleKey}:${code}`] ?? 1
  return {
    moduleKey,
    moduleName: spec.name,
    entity: spec.entity,
    rowId: Number(row.id),
    code,
    name: String(row[spec.nameField] ?? ''),
    status: String(row.status),
    revision,
  }
}

function buildJointVerification(objects: ReleaseObject[]): JointVerification[] {
  const eventObject = objects.find((item) => item.moduleKey === 'eventspec')
  const downstream = objects.filter((item) => item.moduleKey !== 'eventspec')
  return [
    {
      side: SIDES[0],
      scope: '只看得到事件定义：特征与标签的字段不在本业务面视野内',
      status: eventObject ? '通过' : '待复核',
      summary: eventObject
        ? `事件定义 ${eventObject.code} 修订 ${eventObject.revision} 与窗口一致，其余对象本侧不可见`
        : '窗口内缺少事件定义，本侧无法核验',
      checkedAt: nowStamp(),
    },
    {
      side: SIDES[1],
      scope: '只看得到特征模板与标签规则：事件定义的参数结构不在本业务面视野内',
      status: downstream.length === 2 ? '通过' : '待复核',
      summary:
        downstream.length === 2
          ? `特征 ${downstream[0].code} / 标签 ${downstream[1].code} 与事件清单同版本，事件定义本侧不可见`
          : '窗口内下游对象不齐，本侧无法核验',
      checkedAt: nowStamp(),
    },
  ]
}

function buildReviewChecklist(manifest: CompatManifest, window: ReleaseWindow): ReviewChecklist {
  const eventObject = manifest.objects.find((item) => item.moduleKey === 'eventspec')!
  const featureObject = manifest.objects.find((item) => item.moduleKey === 'feature')!
  const actionObject = manifest.objects.find((item) => item.moduleKey === 'action')!
  const rows: ReviewChecklistRow[] = [
    {
      step: 1,
      flow: '事件定义 → 兼容发布清单',
      fromModule: '事件规范',
      fromCode: eventObject.code,
      toModule: eventObject.entity,
      toCode: manifest.id,
      check: '一致',
      detail: `从事件定义读到兼容发布清单 ${manifest.windowKey} v${manifest.version}，摘要 ${manifest.digest}`,
    },
    {
      step: 2,
      flow: '兼容发布清单 → 特征模板',
      fromModule: eventObject.moduleName,
      fromCode: eventObject.code,
      toModule: '特征工程',
      toCode: featureObject.code,
      check: '一致',
      detail: `特征模板经清单 ${manifest.id} v${manifest.version} 与事件定义对齐，修订 ${featureObject.revision}`,
    },
    {
      step: 3,
      flow: '兼容发布清单 → 标签规则',
      fromModule: eventObject.moduleName,
      fromCode: eventObject.code,
      toModule: '行动标签',
      toCode: actionObject.code,
      check: '一致',
      detail: `标签规则经清单 ${manifest.id} v${manifest.version} 与事件定义对齐，修订 ${actionObject.revision}`,
    },
    {
      step: 4,
      flow: '窗口 → 冻结版本',
      fromModule: '统一发布窗口',
      fromCode: window.id,
      toModule: '兼容发布清单',
      toCode: manifest.id,
      check: window.manifestId === manifest.id ? '一致' : '待复核',
      detail: `窗口 ${window.windowKey} 当前冻结版本指向 ${window.manifestId}`,
    },
  ]
  return {
    id: nextId('review', 'RVW'),
    manifestId: manifest.id,
    windowId: window.id,
    windowKey: window.windowKey,
    version: manifest.version,
    generatedAt: nowStamp(),
    status: rows.every((row) => row.check === '一致') ? '完整' : '待复核',
    rows,
  }
}

export type SubmitInput = {
  windowKey: string
  publisher: string
  eventspec: string
  feature: string
  action: string
  strategy?: WindowStrategy
}

export type SubmitResult = {
  ok: boolean
  kind: 'published' | 'blocked' | 'retried' | 'conflict'
  message: string
  window?: ReleaseWindow
  manifest?: CompatManifest
  receipt: ConflictReceipt
}

function failurePositions(
  input: SubmitInput,
  objects: ReleaseObject[],
  problems: Partial<Record<ReleaseModuleKey, string>>,
): ConflictReceipt['failures'] {
  const codes: Record<ReleaseModuleKey, string> = {
    eventspec: input.eventspec,
    feature: input.feature,
    action: input.action,
  }
  return MODULE_ORDER.map((moduleKey, index) => {
    const spec = MODULE_SPEC[moduleKey]
    const object = objects.find((item) => item.moduleKey === moduleKey)
    const reason = problems[moduleKey] ?? '对象完整，失败位置定位在窗口互斥锁：同窗口已有完整版本落库'
    return {
      moduleKey,
      moduleName: spec.name,
      entity: spec.entity,
      code: object?.code ?? codes[moduleKey] ?? '—',
      position: `${input.windowKey} / 第${index + 1}对象 / ${object?.code ?? codes[moduleKey] ?? '未登记'}`,
      reason,
    }
  })
}

function recordReceipt(receipt: ConflictReceipt): ConflictReceipt {
  const state = load()
  state.receipts = [receipt, ...state.receipts]
  persist(state)
  return receipt
}

export function submitWindow(input: SubmitInput): SubmitResult {
  const state = load()
  const strategy: WindowStrategy = input.strategy ?? 'latest-complete'
  const codes: Array<[ReleaseModuleKey, string]> = [
    ['eventspec', input.eventspec.trim()],
    ['feature', input.feature.trim()],
    ['action', input.action.trim()],
  ]

  const problems: Partial<Record<ReleaseModuleKey, string>> = {}
  const objects: ReleaseObject[] = []
  for (const [moduleKey, code] of codes) {
    if (!code) {
      problems[moduleKey] = `${MODULE_SPEC[moduleKey].entity}未选择，窗口不完整`
      continue
    }
    const object = buildObject(moduleKey, code)
    if (!object) {
      problems[moduleKey] = `没有找到编号为 ${code} 的${MODULE_SPEC[moduleKey].entity}`
      continue
    }
    objects.push(object)
  }

  if (Object.keys(problems).length > 0) {
    const receipt: ConflictReceipt = {
      id: nextId('receipt', 'RCP'),
      windowKey: input.windowKey,
      publisher: input.publisher,
      submittedAt: nowStamp(),
      status: '已拦截',
      message: `窗口 ${input.windowKey} 对象不齐，本请求未落库`,
      objects,
      failures: failurePositions(input, objects, problems),
    }
    recordReceipt(receipt)
    return { ok: false, kind: 'blocked', message: receipt.message, receipt }
  }

  // 同一窗口同一对象组合的重提只允许一份新清单：批次键带摘要，内容相同的重复回执全转冲突。
  // 只认「被窗口互斥锁拦下」的回执作为重提依据；对象不齐被拦的不算版本冲突。
  const priorReceipt = state.receipts.find(
    (item) =>
      item.windowKey === input.windowKey &&
      item.status === '已拦截' &&
      Boolean(item.winnerManifestId),
  )
  const activeWindow = state.windows.find(
    (item) => item.windowKey === input.windowKey && item.status === '当前冻结',
  )

  // 并发提交同一窗口：已有完整版本且本请求不是被拦后的重提，整体拦住。
  // 三个对象各留一条失败位置，方便两个业务面分别定位自己那一段。
  if (activeWindow && !priorReceipt) {
    const reasons = Object.fromEntries(
      MODULE_ORDER.map((moduleKey) => [
        moduleKey,
        `同窗口完整版本 ${activeWindow.manifestId} 已落库，本请求在窗口互斥锁处被拦住`,
      ]),
    ) as Partial<Record<ReleaseModuleKey, string>>
    const receipt: ConflictReceipt = {
      id: nextId('receipt', 'RCP'),
      windowKey: input.windowKey,
      publisher: input.publisher,
      submittedAt: nowStamp(),
      status: '已拦截',
      message: `窗口 ${input.windowKey} 已有完整版本 ${activeWindow.manifestId}，本请求未落库`,
      winnerManifestId: activeWindow.manifestId,
      objects,
      failures: failurePositions(input, objects, reasons),
    }
    recordReceipt(receipt)
    return { ok: false, kind: 'blocked', message: receipt.message, receipt }
  }

  // 重提：同一被拦请求再次提交时只生成一份新清单，之后的回执统一转为跨模块发布窗口冲突。
  const retryBatch = `${input.windowKey}::${digestOf(objects)}`
  if (priorReceipt) {
    const existing = state.manifests.find(
      (item) => item.retryBatch === retryBatch && item.source === '冲突重提',
    )
    if (existing) {
      const receipt: ConflictReceipt = {
        id: nextId('receipt', 'RCP'),
        windowKey: input.windowKey,
        publisher: input.publisher,
        submittedAt: nowStamp(),
        status: '跨模块发布窗口冲突',
        message: `重提批次已生成 ${existing.id}，本回执不再生成新清单，转为跨模块发布窗口冲突`,
        manifestId: existing.id,
        objects,
        failures: failurePositions(input, objects, Object.fromEntries(
          MODULE_ORDER.map((moduleKey) => [moduleKey, `重提已由 ${existing.id} 承担，本回执转为窗口冲突`]),
        ) as Partial<Record<ReleaseModuleKey, string>>),
      }
      recordReceipt(receipt)
      return { ok: false, kind: 'conflict', message: receipt.message, receipt, manifest: existing }
    }
  }

  const manifestId = nextId('manifest', 'MFST')
  const windowId = nextId('window', 'WIN')
  const version = state.manifests.filter((item) => item.windowKey === input.windowKey).length + 1
  const isRetry = Boolean(priorReceipt)
  const manifest: CompatManifest = {
    id: manifestId,
    windowKey: input.windowKey,
    version,
    status: '已冻结',
    source: isRetry ? '冲突重提' : '首次发布',
    strategy,
    createdAt: nowStamp(),
    createdBy: input.publisher,
    objects,
    digest: digestOf(objects),
    verifications: buildJointVerification(objects),
    retryBatch: isRetry ? retryBatch : undefined,
    comparisonOf: activeWindow?.manifestId,
  }
  const window: ReleaseWindow = {
    id: windowId,
    windowKey: input.windowKey,
    status: '当前冻结',
    strategy,
    manifestId,
    objects,
    publisher: input.publisher,
    frozenAt: manifest.createdAt,
    note: isRetry
      ? `重提生成的新完整窗口 v${version}，旧窗口 ${activeWindow?.manifestId} 转为历史对照`
      : `首发完整窗口 v${version}，三个模块共享这一份冻结清单`,
    comparisonOf: activeWindow?.manifestId,
  }
  // 一个窗口只保留一份当前冻结版本，旧版本降为历史对照。
  state.windows = state.windows.map((item) =>
    item.windowKey === input.windowKey && item.status === '当前冻结'
      ? { ...item, status: '历史对照' as const, note: `已被重提窗口 v${version} 取代，保留作对照` }
      : item,
  )
  state.manifests = state.manifests.map((item) =>
    item.id === activeWindow?.manifestId ? { ...item, status: '已被取代' as const } : item,
  )
  state.manifests = [...state.manifests, manifest]
  state.windows = [...state.windows, window]
  const checklist = buildReviewChecklist(manifest, window)
  state.reviews = [checklist, ...state.reviews]
  persist(state)

  const receipt: ConflictReceipt = {
    id: nextId('receipt', 'RCP'),
    windowKey: input.windowKey,
    publisher: input.publisher,
    submittedAt: nowStamp(),
    status: '已转为新清单',
    message: isRetry
      ? `按重提生成新清单 ${manifestId}，其余回执转为跨模块发布窗口冲突`
      : `窗口 ${input.windowKey} 已落库完整版本 ${manifestId}`,
    manifestId,
    objects,
    failures: [],
  }
  recordReceipt(receipt)
  return {
    ok: true,
    kind: isRetry ? 'retried' : 'published',
    message: receipt.message,
    window,
    manifest,
    receipt,
  }
}

export function declareLateRevision(input: {
  windowKey: string
  moduleKey: ReleaseModuleKey
  code: string
  reason?: string
}): LateRevision | null {
  const state = load()
  const window = state.windows.find(
    (item) => item.windowKey === input.windowKey && item.status === '当前冻结',
  )
  if (!window) {
    return null
  }
  const object = window.objects.find((item) => item.moduleKey === input.moduleKey)
  if (!object || object.code !== input.code) {
    return null
  }
  const fromRevision = object.revision
  const toRevision = fromRevision + 1
  state.revisions[`${input.moduleKey}:${input.code}`] = toRevision
  const revision: LateRevision = {
    id: nextId('late', 'LATE'),
    windowKey: input.windowKey,
    windowId: window.id,
    moduleKey: input.moduleKey,
    moduleName: MODULE_SPEC[input.moduleKey].name,
    entity: MODULE_SPEC[input.moduleKey].entity,
    code: input.code,
    fromRevision,
    toRevision,
    detectedAt: nowStamp(),
    state: '待仲裁',
  }
  state.lateRevisions = [revision, ...state.lateRevisions]
  persist(state)
  return revision
}

function refreshedObjects(objects: ReleaseObject[]): ReleaseObject[] {
  return objects.map((item) => {
    const next = buildObject(item.moduleKey, item.code)
    return next ?? item
  })
}

export function arbitrateLateRevision(
  lateId: string,
  strategy: WindowStrategy,
): { ok: boolean; message: string; manifest?: CompatManifest } {
  const state = load()
  const index = state.lateRevisions.findIndex((item) => item.id === lateId)
  if (index < 0 || state.lateRevisions[index].state !== '待仲裁') {
    return { ok: false, message: '该迟到修订不存在或已经仲裁' }
  }
  const late = state.lateRevisions[index]
  const window = state.windows.find((item) => item.id === late.windowId)
  if (!window) {
    return { ok: false, message: '迟到修订对应的窗口已不存在' }
  }
  const baseManifest = state.manifests.find((item) => item.id === window.manifestId)
  if (!baseManifest) {
    return { ok: false, message: '迟到修订对应的清单已不存在' }
  }

  if (strategy === 'first-confirmed') {
    const queued: LateRevision = {
      ...late,
      state: '待审队列',
      queuedAt: nowStamp(),
    }
    state.lateRevisions[index] = queued
    state.pendingReview = [queued, ...state.pendingReview]
    const baseWindow = state.windows.find((item) => item.id === window.id)!
    baseWindow.note = `首发窗口冻结清单 ${baseManifest.id} 保持不变；${late.code} 修订 ${late.toRevision} 进入迟到修订待审队列`
    baseWindow.strategy = strategy
    persist(state)
    return {
      ok: true,
      message: `按首个确认窗口仲裁：${window.windowKey} 保持 ${baseManifest.id} 冻结，${late.code} 进入待审队列`,
    }
  }

  const manifestId = nextId('manifest', 'MFST')
  const windowId = nextId('window', 'WIN')
  const version = state.manifests.filter((item) => item.windowKey === window.windowKey).length + 1
  const objects = refreshedObjects(window.objects)
  const manifest: CompatManifest = {
    id: manifestId,
    windowKey: window.windowKey,
    version,
    status: '已冻结',
    source: '迟到修订',
    strategy,
    createdAt: nowStamp(),
    createdBy: '版本仲裁',
    objects,
    digest: digestOf(objects),
    verifications: buildJointVerification(objects),
    comparisonOf: baseManifest.id,
  }
  const nextWindow: ReleaseWindow = {
    id: windowId,
    windowKey: window.windowKey,
    status: '当前冻结',
    strategy,
    manifestId,
    objects,
    publisher: '版本仲裁',
    frozenAt: manifest.createdAt,
    note: `最晚完整窗口 v${version}，含迟到修订 ${late.code} 修订 ${late.toRevision}，与旧窗口 ${baseManifest.id} 对照`,
    comparisonOf: baseManifest.id,
  }
  const oldWindow = state.windows.find((item) => item.id === window.id)!
  oldWindow.status = '历史对照'
  oldWindow.note = `已被 v${version} 取代，保留作为迟到修订前的对照窗口`
  state.manifests = [...state.manifests.map((item) =>
    item.id === baseManifest.id ? { ...item, status: '已被取代' as const } : item,
  ), manifest]
  state.windows = [...state.windows, nextWindow]
  state.lateRevisions[index] = {
    ...late,
    state: '已并入新窗口',
    resolvedManifestId: manifestId,
  }
  const checklist = buildReviewChecklist(manifest, nextWindow)
  state.reviews = [checklist, ...state.reviews]
  persist(state)
  return {
    ok: true,
    message: `按最晚完整窗口仲裁：生成 ${manifestId}（v${version}），旧窗口 ${baseManifest.id} 转为历史对照`,
    manifest,
  }
}

export function currentWindow(windowKey: string): ReleaseWindow | undefined {
  return load().windows.find(
    (item) => item.windowKey === windowKey && item.status === '当前冻结',
  )
}

export function windowManifests(windowKey: string): CompatManifest[] {
  return load().manifests.filter((item) => item.windowKey === windowKey)
}

export function releaseReset(): void {
  cache = null
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(RELEASE_KEY)
  }
  // 修订号也回到 1，再重新播种演示窗口，避免重置后窗口里挂着不存在的修订。
  persist(seedState())
}

export function objectOptions(moduleKey: ReleaseModuleKey): EntryRow[] {
  return listRows(moduleKey)
}
