import { ref } from 'vue'

// 发布状态是 localStorage 之外的内存缓存，写完后统一 bump 一次让三个页面同时重读。
export const releaseTick = ref(0)

export function bumpReleaseTick(): void {
  releaseTick.value += 1
}
