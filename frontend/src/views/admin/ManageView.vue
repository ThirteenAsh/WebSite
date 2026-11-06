<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, notify, errorMessage } from "../../lib/api";
import { confirmAction, showError } from "../../lib/dialogs";
import { contentDescription } from "../../lib/markdown";
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
import GitHubView from "./GitHubView.vue";
const props = defineProps<{ section: "projects" | "articles" | "moments" }>();
const isProject = computed(() => props.section === "projects");
const isMoment = computed(() => props.section === "moments");
const hasStatusTabs = computed(() => !isProject.value);
const statusTabs = [
  { value: "published", label: "已发布" },
  { value: "draft", label: "草稿箱" },
];
const listPath = computed(() =>
  isProject.value
    ? "/admin/projects"
    : isMoment.value
      ? "/admin/moments"
      : "/admin/contents",
);
const route = useRoute(),
  router = useRouter(),
  query = ref(""),
  status = ref(""),
  loading = ref(false),
  error = ref(""),
  busy = ref(0);
const activeStatus = computed(() =>
  route.query.status === "draft" ? "draft" : "published",
);
const isGitHub = computed(
  () => isProject.value && route.query.view === "github",
);
const result = ref<Page<Content>>({ items: [], total: 0, page: 1, pages: 0 });
let request = 0;
async function load() {
  const id = ++request;
  if (isGitHub.value) {
    loading.value = false;
    error.value = "";
    return;
  }
  loading.value = true;
  error.value = "";
  query.value = String(route.query.q || "");
  status.value = hasStatusTabs.value
    ? activeStatus.value
    : String(route.query.status || "");
  const params = new URLSearchParams({
    q: query.value,
    kind: isProject.value ? "project" : isMoment.value ? "moment" : "article",
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
    if (id === request) {
      error.value = errorMessage(e);
      void showError(error.value, "内容读取失败");
    }
  } finally {
    if (id === request) loading.value = false;
  }
}
function filter() {
  router.push({
    path: listPath.value,
    query: {
      q: query.value || undefined,
      status: status.value || undefined,
      featured: isProject.value ? route.query.featured : undefined,
    },
  });
}
watch(() => route.fullPath, load, { immediate: true });
async function toggle(c: Content) {
  if (busy.value) return;
  busy.value = c.id;
  try {
    const full = await api<Content>(`/admin/contents/${c.id}`);
    full.status = c.status === "published" ? "draft" : "published";
    await api(`/admin/contents/${c.id}`, {
      method: "PUT",
      body: JSON.stringify(full),
    });
    notify(full.status === "published" ? "已发布" : "已撤回为草稿");
    await refreshList();
  } catch (e) {
    void showError(errorMessage(e));
  } finally {
    busy.value = 0;
  }
}
async function refreshList() {
  await load();
  if (!error.value && !result.value.items.length && result.value.page > 1) {
    await router.replace({
      query: { ...route.query, page: Math.max(1, result.value.pages) },
    });
  }
}
async function toggleFeatured(c: Content) {
  if (busy.value) return;
  busy.value = c.id;
  try {
    const full = await api<Content>(`/admin/contents/${c.id}`);
    full.featured = !c.featured;
    await api(`/admin/contents/${c.id}`, {
      method: "PUT",
      body: JSON.stringify(full),
    });
    notify(full.featured ? "已设为首页精选" : "已取消首页精选");
    await refreshList();
  } catch (e) {
    void showError(errorMessage(e), "精选设置未保存");
  } finally {
    busy.value = 0;
  }
}
async function remove(c: Content) {
  if (busy.value) return;
  busy.value = c.id;
  try {
    if (
      !(await confirmAction(
        `确定删除“${contentDescription(c)}”吗？这会同时删除其点赞和浏览统计，无法撤销。`,
        {
          title: isProject.value ? "删除作品" : "删除记录",
          tone: "danger",
          confirmText: "确认删除",
        },
      ))
    )
      return;
    await api(`/admin/contents/${c.id}`, { method: "DELETE" });
    notify("内容已删除");
    await refreshList();
  } catch (e) {
    void showError(errorMessage(e));
  } finally {
    busy.value = 0;
  }
}
</script>
<template>
  <div class="admin-page-heading">
    <div>
      <p class="eyebrow">
        {{
          isProject
            ? "THINGS YOU BUILD"
            : isMoment
              ? "EVERYDAY MOMENTS"
              : "ALL YOUR STORIES"
        }}
      </p>
      <h1>
        {{ isProject ? "作品管理" : isMoment ? "日常管理" : "文章管理"
        }}<span class="heading-dot">.</span>
      </h1>
      <p>
        {{
          isProject
            ? "管理作品介绍、首页精选、展示顺序与仓库信息。"
            : isMoment
              ? "几句话，几张照片，记下生活里的小事。"
              : "管理文章和随笔。"
        }}
      </p>
    </div>
    <RouterLink :to="`${listPath}/new`" class="btn primary"
      ><Icon name="plus" :size="18" />{{
        isProject ? "新建作品" : isMoment ? "记录日常" : "新建文章"
      }}</RouterLink
    >
  </div>
  <nav v-if="isProject" class="manage-project-links" aria-label="作品管理视图">
    <RouterLink
      :to="{ path: listPath, query: { view: 'github' } }"
      class="project-pill"
      :aria-current="isGitHub ? 'page' : undefined"
      ><Icon name="github" :size="16" />GitHub 导入与同步</RouterLink
    >
    <RouterLink
      :to="{
        path: listPath,
        query: {
          ...route.query,
          view: undefined,
          featured: undefined,
          page: undefined,
        },
      }"
      class="project-pill"
      :aria-current="
        !isGitHub && route.query.featured !== '1' ? 'page' : undefined
      "
      >全部作品</RouterLink
    >
    <RouterLink
      :to="{
        path: listPath,
        query: {
          ...route.query,
          view: undefined,
          featured: '1',
          page: undefined,
        },
      }"
      class="project-pill"
      :aria-current="
        !isGitHub && route.query.featured === '1' ? 'page' : undefined
      "
      >首页精选</RouterLink
    >
  </nav>
  <nav v-else class="manage-project-links" aria-label="发布状态">
    <RouterLink
      v-for="tab in statusTabs"
      :key="tab.value"
      class="project-pill"
      :to="{
        path: listPath,
        query: {
          q: route.query.q,
          status: tab.value === 'draft' ? 'draft' : undefined,
        },
      }"
      :aria-current="activeStatus === tab.value ? 'page' : undefined"
      >{{ tab.label }}</RouterLink
    >
  </nav>
  <Transition name="admin-view" mode="out-in">
    <div :key="route.fullPath" class="admin-view">
      <GitHubView v-if="isGitHub" />
      <section v-else class="admin-panel content-table-panel">
        <form class="admin-filters" @submit.prevent="filter">
          <div class="input-icon">
            <Icon name="search" /><input
              v-model="query"
              :placeholder="isMoment ? '搜索日常配文…' : '搜索标题或正文…'"
              aria-label="搜索内容"
              maxlength="100"
            />
          </div>
          <PaperSelect
            v-if="!hasStatusTabs"
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
          <Icon
            :name="hasStatusTabs && activeStatus === 'draft' ? 'edit' : 'book'"
            :size="30"
          />
          <p>
            {{
              hasStatusTabs && !query
                ? activeStatus === "draft"
                  ? "草稿箱还是空的，未发布的内容会保存在这里。"
                  : "还没有已发布的内容。"
                : "还没有符合条件的内容。"
            }}
          </p>
        </div>
        <div
          v-else
          class="content-table-scroll"
          role="region"
          aria-label="内容列表"
          tabindex="0"
        >
          <table class="content-table">
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
                    contentDescription(c)
                  }}</RouterLink>
                  <div class="table-subtitle">
                    {{ kindName(c.kind)
                    }}<span v-if="c.featured"> · 首页精选</span
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
                      v-if="isProject"
                      class="text-link featured-action"
                      :class="{ 'is-featured': c.featured }"
                      :aria-pressed="c.featured"
                      :disabled="busy !== 0"
                      @click="toggleFeatured(c)"
                    >
                      <Icon name="star" :size="14" />{{
                        c.featured ? "取消精选" : "添加精选"
                      }}</button
                    ><button
                      class="text-link"
                      :disabled="busy !== 0"
                      @click="toggle(c)"
                    >
                      {{ c.status === "published" ? "撤回" : "发布" }}</button
                    ><button
                      class="text-link danger-text"
                      :disabled="busy !== 0"
                      @click="remove(c)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
    </div>
  </Transition>
</template>
