<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, session, errorMessage } from "../../lib/api";
import {
  formatDate,
  kindName,
  type Dashboard,
  type Content,
  type Page,
  type SyncResult,
} from "../../lib/types";
import Icon from "../../components/Icon.vue";
const data = ref<Dashboard>(),
  recent = ref<Content[]>([]),
  error = ref(""),
  loading = ref(true);
const sync = computed<SyncResult | null>(() => {
  try {
    return data.value?.github_sync ? JSON.parse(data.value.github_sync) : null;
  } catch {
    return null;
  }
});
const stats = computed(() => [
  {
    label: "已发布",
    value: data.value?.published || 0,
    icon: "book",
    color: "green",
  },
  {
    label: "草稿箱",
    value: data.value?.drafts || 0,
    icon: "edit",
    color: "yellow",
  },
  {
    label: "累计浏览",
    value: data.value?.views || 0,
    icon: "eye",
    color: "orange",
  },
  {
    label: "收到点赞",
    value: data.value?.likes || 0,
    icon: "heart",
    color: "pink",
  },
]);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [d, r] = await Promise.all([
      api<Dashboard>("/admin/dashboard"),
      api<Page<Content>>("/admin/contents?limit=6"),
    ]);
    data.value = d;
    recent.value = r.items;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="admin-page-heading">
    <div>
      <p class="eyebrow">YOUR CREATIVE WORKSPACE</p>
      <h1>你好，{{ session.username }}。<span class="wave">✳</span></h1>
      <p>每个想法，都值得留下一页。</p>
    </div>
    <RouterLink to="/admin/contents/new" class="btn primary"
      ><Icon name="edit" :size="18" />开始新记录</RouterLink
    >
  </div>
  <div v-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button>
  </div>
  <div v-if="loading" class="loading-panel">正在整理工作台…</div>
  <template v-else-if="data"
    ><section class="dashboard-stats">
      <div v-for="stat in stats" :key="stat.label" class="stat-card paper-card">
        <span class="stat-icon" :class="stat.color"
          ><Icon :name="stat.icon" :size="21" /></span
        ><span>{{ stat.label }}</span
        ><strong>{{ stat.value }}</strong>
      </div>
    </section>
    <div class="dashboard-columns">
      <section class="admin-panel">
        <div class="panel-heading">
          <h2>最近编辑</h2>
          <RouterLink to="/admin/contents" class="text-link"
            >管理全部 →</RouterLink
          >
        </div>
        <div v-if="!recent.length" class="empty-panel">
          从第一篇记录开始吧。
        </div>
        <RouterLink
          v-for="c in recent"
          :key="c.id"
          :to="`/admin/contents/${c.id}`"
          class="recent-row"
          ><span class="recent-icon"
            ><Icon :name="c.kind === 'project' ? 'code' : 'book'"
          /></span>
          <div>
            <strong>{{ c.title || "无标题动态" }}</strong
            ><small
              >{{ kindName(c.kind) }} · {{ formatDate(c.updated_at) }}</small
            >
          </div>
          <span class="status-badge" :class="c.status">{{
            c.status === "published" ? "已发布" : "草稿"
          }}</span></RouterLink
        >
      </section>
      <section class="admin-panel sync-panel">
        <span class="large-icon"><Icon name="github" :size="29" /></span>
        <h2>作品，持续生长。</h2>
        <p>
          选中的 GitHub 项目每天自动同步仓库信息，介绍和发布状态仍由你决定。
        </p>
        <div class="sync-last">
          <span>上次同步</span
          ><strong>{{ sync ? formatDate(sync.at) : "尚未同步" }}</strong
          ><small v-if="sync"
            >更新 {{ sync.updated }} 个 · 失败
            {{ sync.errors.length }} 个</small
          >
        </div>
        <RouterLink to="/admin/github" class="btn secondary"
          >管理 GitHub 项目<Icon name="right" :size="16"
        /></RouterLink>
      </section></div
  ></template>
</template>
