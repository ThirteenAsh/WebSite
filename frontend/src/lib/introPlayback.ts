import { reactive } from "vue";

// 只保留在当前页面内存中：站内切换不重播，刷新后自然重置。
export const introPlayback = reactive({
  revealed: false,
  released: false,
  confettiPlayed: false,
});
