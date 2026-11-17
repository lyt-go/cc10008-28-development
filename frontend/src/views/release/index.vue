<template>
  <section class="page release-page">
    <header class="page-head">
      <div>
        <h2>统一发布窗口</h2>
        <p class="page-desc">
          事件规范、特征工程、行动标签在同一窗口内发布一份跨模块兼容发布清单；三个模块只共享一份冻结版本，
          两个业务面各自只能核验自己看得见的那一半。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="resetAll">重置发布状态</button>
      </div>
    </header>

    <p v-if="flash" class="flash" :class="flash.ok ? 'flash-ok' : 'flash-warn'">{{ flash.text }}</p>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">已落库完整清单</span>
        <strong class="stat-value">{{ state.manifests.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">当前冻结窗口</span>
        <strong class="stat-value">{{ currentWindows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">被拦请求</span>
        <strong class="stat-value">{{ blockedReceipts }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">迟到修订待审</span>
        <strong class="stat-value">{{ state.pendingReview.length }}</strong>
      </article>
    </div>

    <section class="release-grid">
      <form class="release-card" @submit.prevent="submit">
        <h3>提交发布窗口</h3>
        <p class="page-desc">
          三件套同窗口提交，只允许一份完整版本落库；被拦请求会保留事件、特征、标签三个对象的失败位置。
        </p>
        <div class="form-grid">
          <label class="filter-item">
            <span>窗口编号</span>
            <input v-model="form.windowKey" placeholder="例如 WIN-EVEN-0004" />
          </label>
          <label class="filter-item">
            <span>发布者</span>
            <input v-model="form.publisher" placeholder="发布者" />
          </label>
          <label class="filter-item">
            <span>事件定义</span>
            <input v-model="form.eventspec" list="eventspec-options" placeholder="EVEN-0003" />
            <datalist id="eventspec-options">
              <option v-for="row in eventOptions" :key="String(row.id)" :value="String(row['事件编号'])">
                {{ row['事件名称'] }} · {{ row.status }}
              </option>
            </datalist>
          </label>
          <label class="filter-item">
            <span>特征模板</span>
            <input v-model="form.feature" list="feature-options" placeholder="FEAT-0003" />
            <datalist id="feature-options">
              <option v-for="row in featureOptions" :key="String(row.id)" :value="String(row['模板编号'])">
                {{ row['特征名称'] }} · {{ row.status }}
              </option>
            </datalist>
          </label>
          <label class="filter-item">
            <span>标签规则</span>
            <input v-model="form.action" list="action-options" placeholder="ACTI-0003" />
            <datalist id="action-options">
              <option v-for="row in actionOptions" :key="String(row.id)" :value="String(row['规则编号'])">
                {{ row['标签名称'] }} · {{ row.status }}
              </option>
            </datalist>
          </label>
          <label class="filter-item">
            <span>仲裁策略</span>
            <select v-model="form.strategy">
              <option value="latest-complete">最晚完整窗口</option>
              <option value="first-confirmed">首个确认窗口</option>
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button class="btn primary" type="submit">提交窗口</button>
          <button class="btn ghost" type="button" @click="fillDemo">填入 EVEN-0003 / FEAT-0003 / ACTI-0003</button>
        </div>
      </form>

      <article class="release-card">
        <h3>联合核验</h3>
        <p class="page-desc">
          兼容发布清单的数据要由两个业务面共同核对；每个业务端只看得到自己一侧，单独拿不到完整核验结果。
        </p>
        <table class="data-table">
          <thead>
            <tr><th>业务面</th><th>可见范围</th><th>结论</th><th>摘要</th></tr>
          </thead>
          <tbody>
            <tr v-for="side in latestVerifications" :key="side.side">
              <td>{{ side.side }}</td>
              <td class="detail-cell">{{ side.scope }}</td>
              <td>
                <span class="badge" :class="side.status === '通过' ? 'badge-ok' : 'badge-warn'">{{ side.status }}</span>
              </td>
              <td class="detail-cell">{{ side.summary }}</td>
            </tr>
            <tr v-if="!latestVerifications.length">
              <td colspan="4" class="empty-state">还没有落库的清单可供联合核验</td>
            </tr>
          </tbody>
        </table>
        <p class="hint">
          结论：两侧各自「通过」，但任一侧都读不到对方字段，必须合看才是完整核验结果。
        </p>
      </article>
    </section>

    <section class="release-card">
      <header class="release-panel-head">
        <div>
          <h3>冻结窗口</h3>
          <p class="page-desc">三个模块只共享一份当前冻结清单；历史对照窗口只用于比较，不再被业务页面读取。</p>
        </div>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>窗口</th>
            <th>状态</th>
            <th>冻结清单</th>
            <th>事件定义</th>
            <th>特征模板</th>
            <th>标签规则</th>
            <th>版本</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="window in sortedWindows" :key="window.id">
            <td>{{ window.windowKey }}</td>
            <td>
              <span class="badge" :class="window.status === '当前冻结' ? 'badge-ok' : 'badge-warn'">{{ window.status }}</span>
            </td>
            <td>{{ window.manifestId }}</td>
            <td>{{ codeOf(window, 'eventspec') }}</td>
            <td>{{ codeOf(window, 'feature') }}</td>
            <td>{{ codeOf(window, 'action') }}</td>
            <td>v{{ versionOf(window) }}</td>
            <td class="detail-cell">{{ window.note }}</td>
          </tr>
          <tr v-if="!sortedWindows.length">
            <td colspan="8" class="empty-state">还没有窗口</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="release-grid">
      <article class="release-card">
        <h3>冲突回执</h3>
        <p class="page-desc">同一窗口的并发提交：一份落库，其余被拦住并保留三个对象的失败位置。</p>
        <table class="data-table">
          <thead>
            <tr><th>回执</th><th>窗口</th><th>发布者</th><th>结果</th></tr>
          </thead>
          <tbody>
            <tr v-for="receipt in state.receipts.slice(0, 6)" :key="receipt.id">
              <td>{{ receipt.id }}</td>
              <td>{{ receipt.windowKey }}</td>
              <td>{{ receipt.publisher }}</td>
              <td>
                <span class="badge" :class="receipt.status === '已拦截' ? 'badge-warn' : 'badge-ok'">{{ receipt.status }}</span>
                <div class="detail-cell">{{ receipt.message }}</div>
              </td>
            </tr>
            <tr v-if="!state.receipts.length">
              <td colspan="4" class="empty-state">暂无回执</td>
            </tr>
          </tbody>
        </table>
      </article>

      <article class="release-card">
        <h3>失败位置（最近一次被拦请求）</h3>
        <table class="data-table">
          <thead>
            <tr><th>模块</th><th>对象</th><th>失败位置</th><th>原因</th></tr>
          </thead>
          <tbody>
            <tr v-for="failure in latestFailures" :key="failure.position">
              <td>{{ failure.moduleName }}</td>
              <td>{{ failure.entity }} · {{ failure.code }}</td>
              <td>{{ failure.position }}</td>
              <td class="detail-cell">{{ failure.reason }}</td>
            </tr>
            <tr v-if="!latestFailures.length">
              <td colspan="4" class="empty-state">没有被拦请求</td>
            </tr>
          </tbody>
        </table>
      </article>
    </section>

    <section class="release-grid">
      <article class="release-card">
        <h3>迟到修订</h3>
        <p class="page-desc">
          三个模块在同一窗口内分别完成后，其中一项出现迟到修订：可登记后按两种策略仲裁。
        </p>
        <form class="form-grid" @submit.prevent="declareLate">
          <label class="filter-item">
            <span>窗口</span>
            <input v-model="lateForm.windowKey" placeholder="WIN-EVEN-0003" />
          </label>
          <label class="filter-item">
            <span>模块</span>
            <select v-model="lateForm.moduleKey">
              <option value="eventspec">事件规范</option>
              <option value="feature">特征工程</option>
              <option value="action">行动标签</option>
            </select>
          </label>
          <label class="filter-item">
            <span>对象编号</span>
            <input v-model="lateForm.code" placeholder="EVEN-0003" />
          </label>
          <label class="filter-item">
            <span>仲裁策略</span>
            <select v-model="lateForm.strategy">
              <option value="latest-complete">最晚完整窗口</option>
              <option value="first-confirmed">首个确认窗口</option>
            </select>
          </label>
          <div class="form-actions">
            <button class="btn" type="button" @click="declareLate">登记迟到修订</button>
          </div>
        </form>
        <table class="data-table">
          <thead>
            <tr><th>修订</th><th>窗口</th><th>对象</th><th>修订号</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in state.lateRevisions" :key="item.id">
              <td>{{ item.id }}</td>
              <td>{{ item.windowKey }}</td>
              <td>{{ item.entity }} · {{ item.code }}</td>
              <td>R{{ item.fromRevision }} → R{{ item.toRevision }}</td>
              <td>{{ item.state }}</td>
            </tr>
            <tr v-if="!state.lateRevisions.length">
              <td colspan="5" class="empty-state">暂无迟到修订</td>
            </tr>
          </tbody>
        </table>
      </article>

      <article class="release-card">
        <h3>仲裁</h3>
        <p class="page-desc">
          最晚完整窗口：留下包含迟到修订的新完整窗口与旧窗口对照；首个确认窗口：首发窗口冻结清单不变，迟到修订进入待审队列。
          两种做法都不打破「三个模块只共享一份完整发布窗口」。
        </p>
        <table class="data-table">
          <thead>
            <tr><th>修订</th><th>对象</th><th>待仲裁</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in pendingLate" :key="item.id">
              <td>{{ item.id }}</td>
              <td>{{ item.code }}</td>
              <td>R{{ item.toRevision }}</td>
              <td class="row-actions">
                <button class="link" type="button" @click="arbitrate(item.id, 'latest-complete')">最晚完整窗口</button>
                <button class="link" type="button" @click="arbitrate(item.id, 'first-confirmed')">首个确认窗口</button>
              </td>
            </tr>
            <tr v-if="!pendingLate.length">
              <td colspan="4" class="empty-state">没有待仲裁的迟到修订</td>
            </tr>
          </tbody>
        </table>
        <template v-if="state.pendingReview.length">
          <h4 class="sub-title">迟到修订待审队列</h4>
          <ul class="plain-list">
            <li v-for="item in state.pendingReview" :key="item.id">
              {{ item.windowKey }} · {{ item.code }} → R{{ item.toRevision }}（{{ item.queuedAt }}）
            </li>
          </ul>
        </template>
      </article>
    </section>

    <section v-if="latestManifest" class="release-card">
      <h3>清单全貌（两个业务面合看才完整）</h3>
      <p class="page-desc">
        最新冻结清单 {{ latestManifest.id }} · {{ latestManifest.windowKey }} v{{ latestManifest.version }} · 摘要 {{ latestManifest.digest }}
      </p>
      <table class="data-table">
        <thead>
          <tr><th>模块</th><th>对象</th><th>名称</th><th>对象状态</th><th>修订</th></tr>
        </thead>
        <tbody>
          <tr v-for="object in latestManifest.objects" :key="object.moduleKey">
            <td>{{ object.moduleName }}</td>
            <td>{{ object.entity }} · {{ object.code }}</td>
            <td>{{ object.name }}</td>
            <td>{{ object.status }}</td>
            <td>R{{ object.revision }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import {
  arbitrateLateRevision,
  declareLateRevision,
  objectOptions,
  releaseReset,
  releaseState,
  submitWindow,
} from '@/data/release-store'
import { bumpReleaseTick, releaseTick } from '@/stores/release'
import type { ReleaseModuleKey, ReleaseWindow, WindowStrategy } from '@/data/release-types'

const form = reactive({
  windowKey: 'WIN-EVEN-0004',
  publisher: '发布者甲',
  eventspec: 'EVEN-0003',
  feature: 'FEAT-0003',
  action: 'ACTI-0003',
  strategy: 'latest-complete' as WindowStrategy,
})

const lateForm = reactive({
  windowKey: 'WIN-EVEN-0003',
  moduleKey: 'feature' as ReleaseModuleKey,
  code: 'FEAT-0003',
  strategy: 'latest-complete' as WindowStrategy,
})

const flash = ref<{ ok: boolean; text: string } | null>(null)

const state = computed(() => {
  void releaseTick.value
  return releaseState()
})

const currentWindows = computed(() => state.value.windows.filter((item) => item.status === '当前冻结'))
const blockedReceipts = computed(() => state.value.receipts.filter((item) => item.status === '已拦截').length)
const sortedWindows = computed(() => [...state.value.windows].reverse())
const latestManifest = computed(() => {
  const manifests = state.value.manifests
  return manifests.length ? manifests[manifests.length - 1] : undefined
})
const latestVerifications = computed(() => latestManifest.value?.verifications ?? [])
const latestFailures = computed(() => {
  const receipt = state.value.receipts.find((item) => item.status === '已拦截' && item.failures.length)
  return receipt?.failures ?? []
})
const pendingLate = computed(() => state.value.lateRevisions.filter((item) => item.state === '待仲裁'))

const eventOptions = computed(() => objectOptions('eventspec'))
const featureOptions = computed(() => objectOptions('feature'))
const actionOptions = computed(() => objectOptions('action'))

function versionOf(window: ReleaseWindow): number {
  return state.value.manifests.find((item) => item.id === window.manifestId)?.version ?? 0
}

function codeOf(window: ReleaseWindow, moduleKey: ReleaseModuleKey): string {
  return window.objects.find((item) => item.moduleKey === moduleKey)?.code ?? '—'
}

function fillDemo() {
  form.windowKey = 'WIN-EVEN-0003'
  form.eventspec = 'EVEN-0003'
  form.feature = 'FEAT-0003'
  form.action = 'ACTI-0003'
}

function submit() {
  const result = submitWindow({ ...form })
  flash.value = { ok: result.ok, text: result.message }
  bumpReleaseTick()
}

function declareLate() {
  const revision = declareLateRevision({
    windowKey: lateForm.windowKey,
    moduleKey: lateForm.moduleKey,
    code: lateForm.code,
  })
  flash.value = revision
    ? { ok: true, text: `已登记迟到修订 ${revision.id}：${revision.code} R${revision.fromRevision} → R${revision.toRevision}` }
    : { ok: false, text: '登记失败：窗口不存在或对象不属于该窗口' }
  bumpReleaseTick()
}

function arbitrate(id: string, strategy: WindowStrategy) {
  const result = arbitrateLateRevision(id, strategy)
  flash.value = { ok: result.ok, text: result.message }
  bumpReleaseTick()
}

function resetAll() {
  releaseReset()
  flash.value = { ok: true, text: '发布状态已重置为演示窗口 EVEN-0003 / FEAT-0003 / ACTI-0003' }
  bumpReleaseTick()
}
</script>
