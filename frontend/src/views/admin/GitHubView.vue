<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, notify, errorMessage } from "../../lib/api";
import { showError } from "../../lib/dialogs";
import { formatDate, type Repo, type SyncResult } from "../../lib/types";
import Icon from "../../components/Icon.vue";
const repos = ref<Repo[]>([]),
  chosen = ref(new Set<number>()),
  filter = ref(""),
  loading = ref(false),
  importing = ref(false),
  syncing = ref(false),
  error = ref(""),
  syncResult = ref<SyncResult>();
const filtered = computed(() =>
  repos.value.filter((r) =>
    `${r.name} ${r.description || ""} ${r.language || ""}`
      .toLowerCase()
      .includes(filter.value.toLowerCase()),
  ),
);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    repos.value = (await api<{ items: Repo[] }>("/admin/github/repos")).items;
    chosen.value.clear();
  } catch (e) {
    error.value = errorMessage(e);
    void showError(error.value, "仓库读取失败");
  } finally {
    loading.value = false;
  }
}
async function add() {
  if (!chosen.value.size) return;
  importing.value = true;
  try {
    const result = await api<{ imported: number; skipped: number }>(
      "/admin/github/import",
      { method: "POST", body: JSON.stringify({ ids: [...chosen.value] }) },
    );
    notify(
      `已导入 ${result.imported} 个项目到草稿箱${result.skipped ? `，跳过 ${result.skipped} 个已有项目` : ""}`,
    );
    await load();
  } catch (e) {
    void showError(errorMessage(e));
  } finally {
    importing.value = false;
  }
}
async function sync() {
  syncing.value = true;
  try {
    syncResult.value = await api<SyncResult>("/admin/github/sync", {
      method: "POST",
    });
    if (syncResult.value.errors.length) {
      void showError(
        `已更新 ${syncResult.value.updated} 个项目，${syncResult.value.errors.length} 个同步失败。\n\n${syncResult.value.errors.join("\n")}`,
        "部分项目未能同步",
      );
    } else {
      notify(`同步完成：更新 ${syncResult.value.updated} 个项目`);
    }
  } catch (e) {
    void showError(errorMessage(e));
  } finally {
    syncing.value = false;
  }
}
function toggle(id: number) {
  if (chosen.value.has(id)) chosen.value.delete(id);
  else chosen.value.add(id);
}
onMounted(load);
</script>
<template>
  <div class="admin-page-heading">
    <div>
      <p class="eyebrow">FROM IDEAS TO REPOSITORIES</p>
      <h1>GitHub 导入与同步<span class="heading-dot">.</span></h1>
      <p>挑选想展示的公开仓库，补充介绍后再发布。</p>
    </div>
    <button class="btn secondary" :disabled="syncing" @click="sync">
      <Icon name="refresh" :class="{ spinning: syncing }" :size="17" />{{
        syncing ? "正在同步…" : "同步已选项目"
      }}
    </button>
  </div>
  <div class="info-strip">
    <Icon name="code" :size="19" /><span
      >每天自动同步一次仓库信息。导入的项目先存为草稿，不会自动公开。</span
    ><RouterLink to="/admin/projects" class="text-link"
      >前往作品管理 →</RouterLink
    >
  </div>
  <div v-if="syncResult" class="admin-panel sync-result">
    <strong>本次同步更新 {{ syncResult.updated }} 个项目</strong>
    <p v-if="!syncResult.errors.length" class="muted">
      自定义文案、精选设置和发布状态均已保留。
    </p>
    <ul v-else class="form-error">
      <li v-for="message in syncResult.errors" :key="message">{{ message }}</li>
    </ul>
  </div>
  <section class="admin-panel github-panel">
    <div class="panel-heading">
      <h2>
        公开仓库 <span class="muted small-text">{{ repos.length }} 个</span>
      </h2>
      <div class="inline-actions">
        <div class="input-icon">
          <Icon name="search" :size="17" /><input
            v-model="filter"
            aria-label="筛选仓库"
            placeholder="筛选仓库名称、描述、语言…"
          />
        </div>
        <button
          class="btn secondary small"
          :disabled="loading || importing"
          @click="load"
        >
          <Icon name="refresh" :class="{ spinning: loading }" :size="16" />刷新
        </button>
      </div>
    </div>
    <div v-if="loading" class="loading-panel">正在读取 GitHub 公开仓库…</div>
    <div v-else-if="error" class="error-panel" role="alert">
      {{ error }} <button class="text-link" @click="load">重试</button>
    </div>
    <div v-else-if="!filtered.length" class="empty-panel">
      没有找到公开仓库，请检查站点设置里的 GitHub 用户名。
    </div>
    <div v-else class="repo-grid">
      <component
        :is="repo.selected ? RouterLink : 'label'"
        v-for="repo in filtered"
        :key="repo.id"
        :to="repo.selected ? `/admin/projects/${repo.content_id}` : undefined"
        :aria-label="repo.selected ? `编辑作品：${repo.name}` : undefined"
        :title="repo.selected ? `编辑作品：${repo.name}` : undefined"
        class="repo-choice"
        :class="{ checked: chosen.has(repo.id), imported: repo.selected }"
        ><div class="repo-choice-top">
          <Icon name="book" :size="18" /><strong>{{ repo.name }}</strong
          ><span v-if="repo.selected" class="status-badge published"
            >已导入 · 编辑 →</span
          ><input
            v-else
            type="checkbox"
            :checked="chosen.has(repo.id)"
            :aria-label="`选择 ${repo.name}`"
            @change="toggle(repo.id)"
          />
        </div>
        <p>{{ repo.description || "这个仓库还没有填写描述。" }}</p>
        <div class="repo-choice-bottom">
          <span>{{ repo.language || "未标注语言" }}</span
          ><span>{{ formatDate(repo.pushed_at) }}</span
          ><span v-if="repo.archived">已归档</span>
        </div></component
      >
    </div>
    <div class="github-import-bar">
      <span>已选 {{ chosen.size }} 个仓库</span
      ><button
        class="btn primary"
        :disabled="!chosen.size || importing || loading"
        @click="add"
      >
        <Icon name="plus" :size="17" />{{
          importing ? "正在导入…" : "导入选中项目"
        }}
      </button>
    </div>
  </section>
</template>
