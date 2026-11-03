<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, notify, errorMessage } from "../../lib/api";
import {
  contentPath,
  adminContentPath,
  formatDate,
  kindName,
  type Content,
  type Page,
} from "../../lib/types";
import Icon from "../../components/Icon.vue";
import Pagination from "../../components/Pagination.vue";
import PaperSelect from "../../components/PaperSelect.vue";
const props = defineProps<{ section: "projects" | "writings" }>();
const isProject = computed(() => props.section === "projects");
const listPath = computed(() =>
  isProject.value ? "/admin/projects" : "/admin/contents",
);
const route = useRoute(),
  router = useRouter(),
  query = ref(""),
  kind = ref(""),
  status = ref(""),
  loading = ref(false),
  error = ref(""),
  busy = ref(0);
const result = ref<Page<Content>>({ items: [], total: 0, page: 1, pages: 0 });
let request = 0;
async function load() {
  const id = ++request;
  loading.value = true;
  error.value = "";
  query.value = String(route.query.q || "");
  kind.value = ["article", "moment"].includes(String(route.query.kind))
    ? String(route.query.kind)
    : "";
  status.value = String(route.query.status || "");
  const params = new URLSearchParams({
    q: query.value,
    kind: isProject.value ? "project" : kind.value || "writing",
    status: status.value,
    page: String(route.query.page || 1),
    limit: "15",
  });
  if (isProject.value && route.query.featured === "1")
    params.set("featured", "1");
  try {
    const data = await api<Page<Content>>(`/admin/contents?${params}`);
    if (id === request) result.value = data;
  } catch (e) {
    if (id === request) error.value = errorMessage(e);
  } finally {
    if (id === request) loading.value = false;
  }
}
function filter() {
  router.push({
    path: listPath.value,
    query: {
      q: query.value || undefined,
      kind: isProject.value ? undefined : kind.value || undefined,
      status: status.value || undefined,
      featured: isProject.value ? route.query.featured : undefined,
    },
  });
}
watch(() => route.fullPath, load, { immediate: true });
async function toggle(c: Content) {
  busy.value = c.id;
  try {
    const full = await api<Content>(`/admin/contents/${c.id}`);
    full.status = c.status === "published" ? "draft" : "published";
    await api(`/admin/contents/${c.id}`, {
      method: "PUT",
      body: JSON.stringify(full),
    });
    notify(full.status === "published" ? "已发布" : "已撤回为草稿");
    await load();
  } catch (e) {
    notify(errorMessage(e), "error");
  } finally {
    busy.value = 0;
  }
}
async function remove(c: Content) {
  if (
    !confirm(
      `确定删除“${c.title || "无标题动态"}”吗？这会同时删除其点赞和浏览统计，无法撤销。`,
    )
  )
    return;
  busy.value = c.id;
  try {
    await api(`/admin/contents/${c.id}`, { method: "DELETE" });
    notify("内容已删除");
    if (result.value.items.length === 1 && result.value.page > 1)
      await router.replace({
        query: { ...route.query, page: result.value.page - 1 },
      });
    else await load();
  } catch (e) {
    notify(errorMessage(e), "error");
  } finally {
    busy.value = 0;
  }
}
</script>
<template>
  <div class="admin-page-heading">
    <div>
      <p class="eyebrow">
        {{ isProject ? "THINGS YOU BUILD" : "ALL YOUR STORIES" }}
      </p>
      <h1>
        {{ isProject ? "作品管理" : "文章与日常"
        }}<span class="heading-dot">.</span>
      </h1>
      <p>
        {{
          isProject
            ? "管理作品介绍、首页精选、展示顺序与仓库信息。"
            : "管理文章、随笔和日常记录。"
        }}
      </p>
    </div>
    <RouterLink :to="`${listPath}/new`" class="btn primary"
      ><Icon name="plus" :size="18" />{{
        isProject ? "新建作品" : "新建记录"
      }}</RouterLink
    >
  </div>
  <div v-if="isProject" class="manage-project-links">
    <RouterLink
      :to="{
        path: listPath,
        query: { ...route.query, featured: undefined, page: undefined },
      }"
      class="project-pill"
      :aria-current="route.query.featured !== '1' ? 'page' : undefined"
      >全部作品</RouterLink
    >
    <RouterLink
      :to="{
        path: listPath,
        query: { ...route.query, featured: '1', page: undefined },
      }"
      class="project-pill"
      :aria-current="route.query.featured === '1' ? 'page' : undefined"
      >首页精选</RouterLink
    >
    <RouterLink to="/admin/github" class="text-link"
      >从 GitHub 导入 →</RouterLink
    >
  </div>
  <section class="admin-panel content-table-panel">
    <form class="admin-filters" @submit.prevent="filter">
      <div class="input-icon">
        <Icon name="search" /><input
          v-model="query"
          placeholder="搜索标题或正文…"
          aria-label="搜索内容"
          maxlength="100"
        />
      </div>
      <PaperSelect
        v-if="!isProject"
        v-model="kind"
        label="内容形式"
        :options="[
          { value: '', label: '全部形式' },
          { value: 'article', label: '文章' },
          { value: 'moment', label: '短动态' },
        ]"
        @change="filter"
      />
      <PaperSelect
        v-model="status"
        label="发布状态"
        :options="[
          { value: '', label: '全部状态' },
          { value: 'published', label: '已发布' },
          { value: 'draft', label: '草稿' },
        ]"
        @change="filter"
      />
      <button type="submit" class="btn secondary">搜索</button>
    </form>
    <div v-if="loading" class="loading-panel">正在读取内容…</div>
    <div v-else-if="error" class="error-panel" role="alert">
      {{ error }} <button class="text-link" @click="load">重试</button>
    </div>
    <div v-else-if="!result.items.length" class="empty-panel">
      <Icon name="book" :size="30" />
      <p>还没有符合条件的内容。</p>
    </div>
    <table v-else class="content-table">
      <thead>
        <tr>
          <th>{{ isProject ? "作品" : "内容" }}</th>
          <th>状态</th>
          <th>浏览 / 点赞</th>
          <th>最近编辑</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in result.items" :key="c.id">
          <td>
            <RouterLink :to="adminContentPath(c)" class="table-title">{{
              c.title || "无标题动态"
            }}</RouterLink>
            <div class="table-subtitle">
              {{ kindName(c.kind) }}<span v-if="c.featured"> · 首页精选</span
              ><span v-if="isProject"> · 顺序 {{ c.sort_order }}</span>
            </div>
          </td>
          <td>
            <span class="status-badge" :class="c.status">{{
              c.status === "published" ? "已发布" : "草稿"
            }}</span>
          </td>
          <td class="mono">{{ c.view_count }} / {{ c.like_count }}</td>
          <td class="table-date">{{ formatDate(c.updated_at) }}</td>
          <td>
            <div class="row-actions">
              <RouterLink :to="adminContentPath(c)" class="text-link"
                >编辑</RouterLink
              ><RouterLink
                v-if="c.status === 'published'"
                :to="contentPath(c)"
                target="_blank"
                class="text-link"
                >查看</RouterLink
              ><button
                class="text-link"
                :disabled="busy === c.id"
                @click="toggle(c)"
              >
                {{ c.status === "published" ? "撤回" : "发布" }}</button
              ><button
                class="text-link danger-text"
                :disabled="busy === c.id"
                @click="remove(c)"
              >
                删除
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="table-footer">
      <span class="muted"
        >共 {{ result.total }} {{ isProject ? "件作品" : "条记录" }}</span
      ><Pagination
        :page="result.page"
        :pages="result.pages"
        @change="(n) => router.push({ query: { ...route.query, page: n } })"
      />
    </div>
  </section>
</template>
