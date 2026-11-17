/** 统一发布窗口的跨模块类型：事件规范、特征工程、行动标签共享同一份冻结清单。 */

export type ReleaseModuleKey = 'eventspec' | 'feature' | 'action'

/** 版本冲突的两种仲裁方式：最晚完整窗口 / 首个确认窗口。 */
export type WindowStrategy = 'latest-complete' | 'first-confirmed'

export type ReleaseObject = {
  moduleKey: ReleaseModuleKey
  moduleName: string
  entity: string
  rowId: number
  code: string
  name: string
  status: string
  revision: number
}

/** 两个业务面对同一份兼容发布清单的联合核验结果。 */
export type JointVerification = {
  side: string
  scope: string
  status: '通过' | '待复核'
  summary: string
  checkedAt: string
}

export type CompatManifest = {
  id: string
  windowKey: string
  version: number
  status: '已冻结' | '已被取代'
  source: '首次发布' | '冲突重提' | '迟到修订'
  strategy: WindowStrategy
  createdAt: string
  createdBy: string
  objects: ReleaseObject[]
  digest: string
  verifications: JointVerification[]
  /** 迟到修订生成新窗口时，指向作为对照的旧清单。 */
  comparisonOf?: string
  /** 冲突重提的批次键，用来保证同一窗口只生成一份新清单。 */
  retryBatch?: string
}

export type ReleaseWindow = {
  id: string
  windowKey: string
  status: '当前冻结' | '历史对照'
  strategy: WindowStrategy
  manifestId: string
  objects: ReleaseObject[]
  publisher: string
  frozenAt: string
  note: string
  comparisonOf?: string
}

/** 被拦请求必须保留三个对象各自的失败位置。 */
export type ReleaseObjectFailure = {
  moduleKey: ReleaseModuleKey
  moduleName: string
  entity: string
  code: string
  position: string
  reason: string
}

export type ConflictReceipt = {
  id: string
  windowKey: string
  publisher: string
  submittedAt: string
  status: '已拦截' | '已转为新清单' | '跨模块发布窗口冲突'
  message: string
  winnerManifestId?: string
  manifestId?: string
  objects: ReleaseObject[]
  failures: ReleaseObjectFailure[]
}

export type LateRevision = {
  id: string
  windowKey: string
  windowId: string
  moduleKey: ReleaseModuleKey
  moduleName: string
  entity: string
  code: string
  fromRevision: number
  toRevision: number
  detectedAt: string
  state: '待仲裁' | '已并入新窗口' | '待审队列'
  resolvedManifestId?: string
  queuedAt?: string
}

export type ReviewChecklistRow = {
  step: number
  flow: string
  fromModule: string
  fromCode: string
  toModule: string
  toCode: string
  check: '一致' | '待复核'
  detail: string
}

/** 特征工程维护的复核数据清单：随新生成的兼容发布清单更新。 */
export type ReviewChecklist = {
  id: string
  manifestId: string
  windowId: string
  windowKey: string
  version: number
  generatedAt: string
  status: '完整' | '待复核'
  rows: ReviewChecklistRow[]
}

export type ReleaseState = {
  seq: { window: number; manifest: number; receipt: number; review: number; late: number }
  windows: ReleaseWindow[]
  manifests: CompatManifest[]
  receipts: ConflictReceipt[]
  reviews: ReviewChecklist[]
  revisions: Record<string, number>
  lateRevisions: LateRevision[]
  pendingReview: LateRevision[]
}
