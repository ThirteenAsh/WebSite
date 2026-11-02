<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, notify, errorMessage } from "../../lib/api";
import {
  contentPath,
  formatDate,
  kindName,
  type Content,
  type Page,
} from "../../lib/types";
import Icon from "../../components/Icon.vue";
import Pagination from "../../components/Pagination.vue";
import PaperSelect from "../../components/PaperSelect.vue";
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
  kind.value = String(route.query.kind || "");
  status.value = String(route.query.status || "");
  const params = new URLSearchParams({
    q: query.value,
    kind: kind.value,
    status: status.value,
    page: String(route.query.page || 1),
    limit: "15",
  });
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
    path: "/admin/contents",
    query: {
      q: query.value || undefined,
      kind: kind.value || undefined,
      status: status.value || undefined,
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
      <p class="eyebrow">ALL YOUR STORIES</p>
      <h1>内容管理<span class="heading-dot">.</span></h1>
      <p>作品、文章和日常，都在这里整理。</p>
    </div>
    <RouterLink to="/admin/contents/new" class="btn primary"
      ><Icon name="plus" :size="18" />新建内容</RouterLink
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
        v-model="kind"
        label="内容形式"
        :options="[
          { value: '', label: '全部形式' },
          { value: 'project', label: '项目' },
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
          <th>内容</th>
          <th>状态</th>
          <th>浏览 / 点赞</th>
          <th>最近编辑</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in result.items" :key="c.id">
          <td>
            <RouterLink :to="`/admin/contents/${c.id}`" class="table-title">{{
              c.title || "无标题动态"
            }}</RouterLink>
            <div class="table-subtitle">
              {{ kindName(c.kind) }}<span v-if="c.featured"> · 首页精选</span
              ><span v-if="c.repo_name"> · {{ c.repo_name }}</span>
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
              <RouterLink :to="`/admin/contents/${c.id}`" class="text-link"
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
      <span class="muted">共 {{ result.total }} 条内容</span
      ><Pagination
        :page="result.page"
        :pages="result.pages"
        @change="(n) => router.push({ query: { ...route.query, page: n } })"
      />
    </div>
  </section>
</template>
