<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, errorMessage } from "../lib/api";
import type { Content, Page } from "../lib/types";
import MomentCard from "../components/MomentCard.vue";
import Pagination from "../components/Pagination.vue";

const route = useRoute(),
  router = useRouter();
const result = ref<Page<Content>>({ items: [], total: 0, page: 1, pages: 0 });
const loading = ref(true),
  error = ref("");
let request = 0;
async function load() {
  const id = ++request;
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({
      kind: "moment",
      page: String(Number(route.query.page) || 1),
      limit: "12",
    });
    const data = await api<Page<Content>>(`/contents?${params}`);
    if (id === request) result.value = data;
  } catch (e) {
    if (id === request) error.value = errorMessage(e);
  } finally {
    if (id === request) loading.value = false;
  }
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
      <div v-if="result.items.length" class="moment-feed">
        <MomentCard v-for="c in result.items" :key="c.id" :content="c" />
      </div>
      <p v-else class="moments-empty">还没有日常，等一个想分享的瞬间。</p>
      <Pagination
        :page="result.page"
        :pages="result.pages"
        @change="(page) => router.push({ query: { ...route.query, page } })"
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
