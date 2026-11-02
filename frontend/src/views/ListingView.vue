<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, errorMessage } from "../lib/api";
import type { Content, Page } from "../lib/types";
import Icon from "../components/Icon.vue";
import ContentCard from "../components/ContentCard.vue";
import Pagination from "../components/Pagination.vue";
const props = defineProps<{ mode: "projects" | "articles" | "search" }>();
const route = useRoute(),
  router = useRouter(),
  input = ref(""),
  loading = ref(false),
  error = ref("");
const result = ref<Page<Content>>({ items: [], total: 0, page: 1, pages: 0 });
const q = computed(() =>
  typeof route.query.q === "string" ? route.query.q.trim() : "",
);
const title = computed(
  () =>
    ({
      projects: "把想法，做出来。",
      articles: "把过程，写下来。",
      search: "找一找，留过的痕迹。",
    })[props.mode],
);
let request = 0;
async function load() {
  const id = ++request;
  input.value = q.value;
  error.value = "";
  if (props.mode === "search" && !q.value) {
    result.value = { items: [], total: 0, page: 1, pages: 0 };
    loading.value = false;
    return;
  }
  loading.value = true;
  const params = new URLSearchParams({
    page: String(Number(route.query.page) || 1),
    limit: "12",
  });
  if (props.mode === "projects") params.set("kind", "project");
  if (props.mode === "articles") params.set("kind", "writing");
  if (q.value) params.set("q", q.value);
  try {
    const data = await api<Page<Content>>(`/contents?${params}`);
    if (id === request) result.value = data;
  } catch (e) {
    if (id === request) error.value = errorMessage(e);
  } finally {
    if (id === request) loading.value = false;
  }
}
watch(() => [props.mode, route.query.q, route.query.page], load, {
  immediate: true,
});
function search() {
  router.push({
    path: route.path,
    query: input.value.trim() ? { q: input.value.trim() } : {},
  });
}
function page(n: number) {
  router.push({ path: route.path, query: { ...route.query, page: n } });
}
</script>
<template>
  <section class="listing-header">
    <p class="eyebrow">
      {{
        mode === "projects"
          ? "THE PROJECT ARCHIVE"
          : mode === "articles"
            ? "NOTES & EVERYDAY LIFE"
            : "SEARCH THE SPACE"
      }}
    </p>
    <h1>{{ title }}</h1>
    <p>
      {{
        mode === "projects"
          ? "从一个念头，到一次尝试，再到一个可以分享的作品。"
          : mode === "articles"
            ? "代码之外，也有值得记住的日常。所有文字都放在这里。"
            : "在作品、技术笔记和日常记录中搜索。"
      }}
    </p>
    <form class="search-form" @submit.prevent="search">
      <Icon name="search" /><input
        v-model="input"
        :aria-label="mode === 'search' ? '搜索全部内容' : '搜索当前栏目'"
        maxlength="100"
        :placeholder="
          mode === 'search'
            ? '输入关键词，搜索所有内容…'
            : '输入关键词，搜索这个栏目…'
        "
      /><button class="btn primary" type="submit">搜索</button>
    </form>
  </section>
  <div v-if="loading" class="loading-panel" role="status">正在寻找…</div>
  <div v-else-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button>
  </div>
  <template v-else-if="mode !== 'search' || q"
    ><div class="results-heading">
      <span>{{
        q ? `“${q}” 的搜索结果` : mode === "projects" ? "所有作品" : "所有记录"
      }}</span
      ><span
        >{{ result.total }}
        {{ mode === "projects" ? "个作品" : "条内容" }}</span
      >
    </div>
    <div
      v-if="result.items.length"
      :class="mode === 'projects' ? 'project-grid' : 'writing-list'"
      class="results-list"
    >
      <ContentCard
        v-for="(c, i) in result.items"
        :key="c.id"
        :content="c"
        :index="(result.page - 1) * 12 + i"
      />
    </div>
    <div v-else class="empty-panel">
      <Icon :name="q ? 'search' : 'book'" :size="30" />
      <h3>{{ q ? "暂时没有找到相关内容。" : "新的记录，慢慢写。" }}</h3>
      <p>{{ q ? "试试更简短的关键词。" : "这里会陆续留下新的想法。" }}</p>
      <RouterLink v-if="q" :to="route.path" class="text-link"
        >清除搜索</RouterLink
      >
    </div>
    <Pagination :page="result.page" :pages="result.pages" @change="page"
  /></template>
  <div v-else class="empty-panel search-empty">
    <Icon name="search" :size="36" />
    <p>输入一个关键词，开始寻找。</p>
  </div>
</template>
