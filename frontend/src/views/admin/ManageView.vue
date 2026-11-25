<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
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
const savingOrder = ref(false),
  dragged = ref<number | null>(null),
  dropIndex = ref(-1);
const locked = computed(
  () => loading.value || savingOrder.value || busy.value !== 0,
);
const draggedIndex = computed(() =>
  result.value.items.findIndex((item) => item.id === dragged.value),
);
let request = 0;
async function load() {
  const id = ++request;
  endDrag();
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
function endDrag() {
  dragged.value = null;
  dropIndex.value = -1;
}
function startDrag(event: DragEvent, c: Content) {
  if (locked.value || !isProject.value) {
    event.preventDefault();
    return;
  }
  dragged.value = c.id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(c.id));
  }
}
function dragOver(event: DragEvent, index: number) {
  if (dragged.value === null || locked.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dropIndex.value = index;
}
function drop(event: DragEvent, index: number) {
  if (dragged.value === null) return;
  event.preventDefault();
  const from = draggedIndex.value;
  endDrag();
  void moveProject(from, index);
}
async function moveProject(from: number, to: number) {
  if (
    !isProject.value ||
    locked.value ||
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= result.value.items.length ||
    to >= result.value.items.length
  )
    return;
  const currentRequest = request;
  const focused = document.activeElement as HTMLElement | null;
  const previous = result.value.items;
  const items = [...previous];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved!);
  result.value.items = items;
  savingOrder.value = true;
  try {
    const saved = await api<{ items: Pick<Content, "id" | "sort_order">[] }>(
      "/admin/projects/order",
      {
        method: "PUT",
        body: JSON.stringify({ ids: items.map((item) => item.id) }),
      },
    );
    if (request === currentRequest) {
      const positions = new Map(
        saved.items.map((item) => [item.id, item.sort_order]),
      );
      result.value.items = items.map((item) => ({
        ...item,
        sort_order: positions.get(item.id) ?? item.sort_order,
      }));
    } else if (
      isProject.value &&
      route.path === listPath.value &&
      !isGitHub.value
    ) {
      await load();
    }
    notify("作品顺序已保存");
  } catch (e) {
    if (request === currentRequest) result.value.items = previous;
    void showError(errorMessage(e), "作品顺序未保存");
  } finally {
    savingOrder.value = false;
    await nextTick();
    if (
      request === currentRequest &&
      focused?.isConnected &&
      document.activeElement === document.body
    )
      focused.focus();
  }
}
async function toggle(c: Content) {
  if (locked.value) return;
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
  if (locked.value) return;
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
  if (locked.value) return;
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
        <p
          v-if="isProject && result.items.length"
          class="project-order-hint"
          role="status"
        >
          {{
            savingOrder
              ? "正在保存作品顺序…"
              : "拖动左侧手柄或用上下按钮调整本页顺序，自动保存并同步到展示页。"
          }}
        </p>
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
          <table
            class="content-table"
            :class="{ 'project-order-table': isProject }"
            :aria-busy="savingOrder"
          >
            <thead>
              <tr>
                <th v-if="isProject" scope="col">排序</th>
                <th>{{ isProject ? "作品" : "内容" }}</th>
                <th>状态</th>
                <th>浏览 / 点赞</th>
                <th>最近编辑</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(c, i) in result.items"
                :key="c.id"
                :class="{
                  'project-dragging': dragged === c.id,
                  'project-drop-before': dropIndex === i && draggedIndex > i,
                  'project-drop-after': dropIndex === i && draggedIndex < i,
                }"
                @dragover="dragOver($event, i)"
                @dragleave="dropIndex === i && (dropIndex = -1)"
                @drop="drop($event, i)"
              >
                <td v-if="isProject" class="project-order-cell">
                  <div class="project-order-controls">
                    <button
                      type="button"
                      class="project-drag-handle"
                      :aria-label="`拖动排序：${c.title}`"
                      title="拖动调整顺序，也可按上下方向键"
                      :draggable="!locked && result.items.length > 1"
                      :disabled="locked || result.items.length < 2"
                      @dragstart="startDrag($event, c)"
                      @dragend="endDrag"
                      @keydown.up.prevent="moveProject(i, i - 1)"
                      @keydown.down.prevent="moveProject(i, i + 1)"
                    >
                      <Icon name="grip" :size="21" />
                    </button>
                    <div class="project-order-buttons">
                      <button
                        type="button"
                        :aria-label="`上移：${c.title}`"
                        title="上移"
                        :disabled="locked || i === 0"
                        @click="moveProject(i, i - 1)"
                      >
                        <Icon name="up" :size="14" />
                      </button>
                      <button
                        type="button"
                        :aria-label="`下移：${c.title}`"
                        title="下移"
                        :disabled="locked || i === result.items.length - 1"
                        @click="moveProject(i, i + 1)"
                      >
                        <Icon name="down" :size="14" />
                      </button>
                    </div>
                  </div>
                </td>
                <td>
                  <RouterLink :to="adminContentPath(c)" class="table-title">{{
                    contentDescription(c)
                  }}</RouterLink>
                  <div class="table-subtitle">
                    {{ kindName(c.kind)
                    }}<span v-if="c.featured"> · 首页精选</span>
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
                      :disabled="locked"
                      @click="toggleFeatured(c)"
                    >
                      <Icon name="star" :size="14" />{{
                        c.featured ? "取消精选" : "添加精选"
                      }}</button
                    ><button
                      class="text-link"
                      :disabled="locked"
                      @click="toggle(c)"
                    >
                      {{ c.status === "published" ? "撤回" : "发布" }}</button
                    ><button
                      class="text-link danger-text"
                      :disabled="locked"
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

<style scoped>
.project-order-hint {
  margin: 0;
  padding: 12px 21px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.project-order-table td:nth-child(2) {
  max-width: 280px;
}
.project-order-table .project-order-cell {
  width: 76px;
  padding: 16px 10px 16px 18px;
}
.project-order-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.project-order-controls button {
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--muted);
}
.project-order-controls button:not(:disabled):hover {
  border-color: var(--line-dark);
  background: var(--code);
  color: var(--ink);
}
.project-order-controls button:disabled {
  opacity: 0.3;
}
.project-drag-handle {
  width: 30px;
  height: 42px;
  cursor: grab;
}
.project-drag-handle:active {
  cursor: grabbing;
}
.project-order-buttons {
  display: grid;
  gap: 2px;
}
.project-order-buttons button {
  width: 25px;
  height: 25px;
}
.project-dragging {
  opacity: 0.45;
}
.project-drop-before {
  box-shadow: inset 0 3px var(--accent);
}
.project-drop-after {
  box-shadow: inset 0 -3px var(--accent);
}
</style>
