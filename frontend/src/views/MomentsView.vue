<script setup lang="ts">
import { watch } from "vue";
import { useRoute } from "vue-router";
import { useInfiniteFeed } from "../lib/infiniteFeed";
import MomentCard from "../components/MomentCard.vue";
import InfiniteLoader from "../components/InfiniteLoader.vue";

const route = useRoute();
const {
  items,
  loading,
  error,
  loadingMore,
  moreError,
  hasMore,
  reset,
  loadMore,
} = useInfiniteFeed("/contents?kind=moment&limit=12");
function load() {
  return reset(Math.max(1, Math.floor(Number(route.query.page) || 1)));
}
watch(() => route.query.page, load, { immediate: true });
</script>

<template>
  <section class="moments-page">
    <header class="moments-heading">
      <h1>我的朋友圈</h1>
    </header>
    <div v-if="loading" class="loading-panel" role="status">正在翻看日常…</div>
    <div v-else-if="error" class="error-panel" role="alert">
      {{ error }} <button class="text-link" @click="load">重试</button>
    </div>
    <template v-else>
      <div v-if="items.length" class="moment-feed">
        <MomentCard v-for="c in items" :key="c.id" :content="c" />
      </div>
      <p v-else class="moments-empty">还没有日常，等一个想分享的瞬间。</p>
      <InfiniteLoader
        v-if="items.length"
        :has-more="hasMore"
        :loading="loadingMore"
        :error="moreError"
        @load="loadMore"
      />
    </template>
  </section>
</template>

<style scoped>
.moments-page {
  max-width: 700px;
  margin: 20px auto 70px;
}
.moments-heading {
  padding: 15px 0 28px;
  border-bottom: 1px solid var(--line);
}
.moments-heading h1 {
  font-size: 30px;
  margin: 0 0 7px;
  letter-spacing: 1px;
}
.moments-heading p,
.moments-empty {
  color: var(--muted);
  font-size: 14px;
}
.moments-empty {
  padding: 50px 0;
  text-align: center;
}
@media (max-width: 700px) {
  .moments-page {
    margin-top: 8px;
  }
  .moments-heading {
    padding-bottom: 22px;
  }
  .moments-heading h1 {
    font-size: 26px;
  }
}
</style>
