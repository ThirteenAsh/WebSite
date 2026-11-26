<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
const props = defineProps<{
  hasMore: boolean;
  loading: boolean;
  error: string;
}>();
const emit = defineEmits<{ load: [] }>();
const sentinel = ref<HTMLElement>();
let observer: IntersectionObserver | undefined;
function observe() {
  observer?.disconnect();
  if (!props.hasMore || props.loading || props.error || !sentinel.value) return;
  observer?.observe(sentinel.value);
}
onMounted(() => {
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          props.hasMore &&
          !props.loading &&
          !props.error
        )
          emit("load");
      },
      { rootMargin: "0px 0px 160px 0px" },
    );
    observe();
  }
});
watch(() => [props.hasMore, props.loading, props.error], observe, {
  flush: "post",
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div ref="sentinel" class="infinite-loader">
    <p v-if="loading" role="status">正在加载更多…</p>
    <div v-else-if="error" role="alert">
      {{ error }}
      <button type="button" class="text-link" @click="emit('load')">
        重试加载
      </button>
    </div>
    <button
      v-else-if="hasMore"
      type="button"
      class="text-link"
      @click="emit('load')"
    >
      继续下滑加载更多
    </button>
    <p v-else role="status">已经到底了</p>
  </div>
</template>
<style scoped>
.infinite-loader {
  padding: 24px 0;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
</style>
