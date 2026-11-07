<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { api, errorMessage } from "../lib/api";
import { showError } from "../lib/dialogs";
import type { Page, Upload, UploadGroup } from "../lib/types";
import Icon from "./Icon.vue";
import ImageViewer from "./ImageViewer.vue";
import MediaGroupSelect from "./MediaGroupSelect.vue";
import Pagination from "./Pagination.vue";

const scope = defineModel<string>({ required: true });
defineProps<{ picker?: boolean }>();
const result = ref<Page<Upload>>({ items: [], total: 0, page: 1, pages: 0 });
const groups = ref<UploadGroup[]>([]);
const groupError = ref(false);
const loading = ref(false);
const error = ref("");
const searchText = ref("");
const query = ref("");
const viewer = ref<InstanceType<typeof ImageViewer>>();
const urls = computed(() => result.value.items.map((image) => image.url));
let request = 0;

async function loadGroups() {
  groupError.value = false;
  try {
    const items = await api<UploadGroup[]>("/admin/uploads/groups");
    if (!Array.isArray(items)) throw new Error("图片分类响应异常");
    groups.value = items;
  } catch {
    groupError.value = true;
  }
}
async function load(page = 1) {
  const id = ++request;
  loading.value = true;
  error.value = "";
  const params = new URLSearchParams({ page: String(page) });
  if (scope.value) params.set("content_id", scope.value);
  if (query.value) params.set("q", query.value);
  try {
    const next = await api<Page<Upload>>(`/admin/uploads?${params}`);
    if (id === request) result.value = next;
  } catch (e) {
    if (id !== request) return;
    error.value = errorMessage(e);
    void showError(error.value, "图片库读取失败");
  } finally {
    if (id === request) loading.value = false;
  }
}
function search() {
  query.value = searchText.value.trim();
  void load();
}
function preview(index: number, event: MouseEvent) {
  void viewer.value?.open(index, event.currentTarget as HTMLElement);
}
watch(scope, () => load());
onMounted(() => {
  void loadGroups();
  void load();
});
onBeforeUnmount(() => request++);
defineExpose({ groups, result, load });
</script>

<template>
  <div class="media-library">
    <form class="media-library-filters" role="search" @submit.prevent="search">
      <label>
        图片分类
        <MediaGroupSelect
          v-model="scope"
          :groups="groups"
          label="图片分类"
          all
        />
      </label>
      <label>
        文件名
        <input
          v-model="searchText"
          type="search"
          maxlength="100"
          aria-label="图片文件名"
          placeholder="搜索文件名…"
        />
      </label>
      <button type="submit" class="btn secondary">
        <Icon name="search" :size="16" />搜索
      </button>
    </form>
    <p v-if="groupError" class="muted small-text">
      分类暂时无法读取。<button
        type="button"
        class="text-link"
        @click="loadGroups"
      >
        重试分类
      </button>
    </p>
    <div v-if="loading" class="loading-panel" role="status">正在读取图片…</div>
    <div v-else-if="error" class="error-panel" role="alert">
      {{ error }}
      <button type="button" class="text-link" @click="load()">重试</button>
    </div>
    <div v-else-if="!result.items.length" class="empty-panel">
      <Icon name="image" :size="28" />
      <p>{{ query ? "没有匹配的图片。" : "这个分类暂时没有图片。" }}</p>
    </div>
    <template v-else>
      <p class="media-library-count muted small-text" role="status">
        {{ result.total }} 张图片
      </p>
      <div class="media-grid" :class="{ 'media-picker-grid': picker }">
        <article
          v-for="(image, index) in result.items"
          :key="image.id"
          class="media-card"
          :class="{ 'admin-panel': !picker }"
        >
          <button
            type="button"
            class="media-card-preview"
            :aria-label="`预览 ${image.original_name}`"
            @click="preview(index, $event)"
          >
            <img :src="image.url" alt="" loading="lazy" />
            <span><Icon name="eye" :size="15" />预览</span>
          </button>
          <div class="media-card-info">
            <strong :title="image.original_name">{{
              image.original_name
            }}</strong>
            <span v-if="!picker"
              >{{ image.width }} × {{ image.height }} ·
              {{ Math.ceil(image.size_bytes / 1024) }} KB</span
            >
            <slot name="actions" :image="image" />
          </div>
        </article>
      </div>
      <Pagination :page="result.page" :pages="result.pages" @change="load" />
    </template>
    <ImageViewer ref="viewer" :images="urls" original-link />
  </div>
</template>
