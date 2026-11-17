<template>
  <section class="release-panel" :data-release-module="moduleKey">
    <header class="release-panel-head">
      <div>
        <h3>统一发布窗口</h3>
        <p class="page-desc">
          事件规范、特征工程、行动标签共同读取同一份跨模块兼容发布清单；本页只读当前冻结版本。
        </p>
      </div>
      <RouterLink class="btn primary link-btn" to="/release">打开统一发布窗口</RouterLink>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">当前冻结窗口</span>
        <strong class="stat-value">{{ frozenWindows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">本模块最新修订</span>
        <strong class="stat-value">{{ moduleRevisionLabel }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">共享冻结清单</span>
        <strong class="stat-value small-value">{{ latestManifestId }}</strong>
      </article>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>窗口</th>
          <th>冻结版本</th>
          <th>事件定义</th>
          <th>特征模板</th>
          <th>标签规则</th>
          <th>清单摘要</th>
          <th>本页读取</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="window in frozenWindows" :key="window.id">
          <td>{{ window.windowKey }}</td>
          <td>{{ window.manifestId }} · v{{ versionOf(window) }}</td>
          <td>{{ codeOf(window, 'eventspec') }}</td>
          <td>{{ codeOf(window, 'feature') }}</td>
          <td>{{ codeOf(window, 'action') }}</td>
          <td>{{ digestOf(window) }}</td>
          <td class="read-cell" :class="readOf(window).ok ? 'read-ok' : 'read-pending'">
            {{ readOf(window).text }}
          </td>
        </tr>
        <tr v-if="!frozenWindows.length">
          <td colspan="7" class="empty-state">还没有冻结窗口，去统一发布窗口提交事件 / 特征 / 标签三件套</td>
        </tr>
      </tbody>
    </table>

    <section v-if="showReview" class="review-block">
      <header class="release-panel-head">
        <div>
          <h3>复核数据清单</h3>
          <p class="page-desc">
            特征工程维护，随新生成的跨模块兼容发布清单更新：从事件定义读到兼容发布清单，再落到特征模板与标签规则。
          </p>
        </div>
        <span class="badge" :class="latestReview?.status === '完整' ? 'badge-ok' : 'badge-warn'">
          {{ latestReview ? latestReview.status : '未生成' }}
        </span>
      </header>
      <table v-if="latestReview" class="data-table">
        <thead>
          <tr>
            <th>步骤</th>
            <th>数据流</th>
            <th>来源模块 / 对象</th>
            <th>目标模块 / 对象</th>
            <th>核对</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in latestReview.rows" :key="row.step">
            <td>{{ row.step }}</td>
            <td>{{ row.flow }}</td>
            <td>{{ row.fromModule }} / {{ row.fromCode }}</td>
            <td>{{ row.toModule }} / {{ row.toCode }}</td>
            <td>{{ row.check }}</td>
            <td class="detail-cell">{{ row.detail }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-state">还没有复核数据清单</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { moduleSpec, releaseRevisions, releaseState } from '@/data/release-store'
import type { ReleaseModuleKey, ReleaseWindow, ReviewChecklist } from '@/data/release-types'
import { releaseTick } from '@/stores/release'

const props = withDefaults(
  defineProps<{ moduleKey: ReleaseModuleKey; showReview?: boolean }>(),
  { showReview: false },
)

const spec = moduleSpec(props.moduleKey)

const state = computed(() => {
  void releaseTick.value
  return releaseState()
})

const frozenWindows = computed(() =>
  state.value.windows.filter((item) => item.status === '当前冻结'),
)

const latestManifestId = computed(() =>
  frozenWindows.value.length
    ? frozenWindows.value[frozenWindows.value.length - 1].manifestId
    : '—',
)

const moduleRevisionLabel = computed(() => {
  void releaseTick.value
  const revisions = releaseRevisions()
  const codes = Object.keys(revisions).filter((key) => key.startsWith(`${props.moduleKey}:`))
  if (!codes.length) {
    return '—'
  }
  return `R${Math.max(...codes.map((key) => revisions[key]))}`
})

const latestReview = computed<ReviewChecklist | undefined>(() => state.value.reviews[0])

function versionOf(window: ReleaseWindow): number {
  return state.value.manifests.find((item) => item.id === window.manifestId)?.version ?? 0
}

function digestOf(window: ReleaseWindow): string {
  return state.value.manifests.find((item) => item.id === window.manifestId)?.digest ?? '—'
}

function codeOf(window: ReleaseWindow, moduleKey: ReleaseModuleKey): string {
  return window.objects.find((item) => item.moduleKey === moduleKey)?.code ?? '—'
}

function readOf(window: ReleaseWindow): { ok: boolean; text: string } {
  void releaseTick.value
  const object = window.objects.find((item) => item.moduleKey === props.moduleKey)
  if (!object) {
    return { ok: false, text: `${spec.entity}不在本窗口` }
  }
  const revisions = releaseRevisions()
  const current = revisions[`${props.moduleKey}:${object.code}`] ?? object.revision
  if (current !== object.revision) {
    return { ok: false, text: `${object.code} 修订 R${current} 已晚于冻结 R${object.revision}` }
  }
  return { ok: true, text: `${object.code} 读取 ${window.manifestId} v${versionOf(window)}` }
}
</script>
