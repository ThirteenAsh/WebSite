<script setup lang="ts">
import { nextTick, ref } from "vue";
import { api, upload, notify, errorMessage } from "../lib/api";
import { showError } from "../lib/dialogs";
import type { Upload, Page } from "../lib/types";
import Icon from "./Icon.vue";
import Pagination from "./Pagination.vue";
const emit = defineEmits<{ select: [url: string] }>();
const dialog = ref<HTMLDialogElement>(),
  loading = ref(false),
  busy = ref(false),
  error = ref("");
const result = ref<Page<Upload>>({ items: [], total: 0, page: 1, pages: 0 });
let pickerSession = 0;
async function load(page = 1) {
  loading.value = true;
  error.value = "";
  try {
    result.value = await api<Page<Upload>>(`/admin/uploads?page=${page}`);
  } catch (e) {
    error.value = errorMessage(e);
    void showError(error.value, "图片库读取失败");
  } finally {
    loading.value = false;
  }
}
async function open() {
  await nextTick();
  const el = dialog.value;
  if (!el || el.open) return;
  el.showModal();
  pickerSession++;
  await load();
}
function choose(url: string) {
  emit("select", url);
  dialog.value?.close();
}
async function add(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  const session = pickerSession;
  busy.value = true;
  try {
    const image = await upload(file);
    if (dialog.value?.open && session === pickerSession) choose(image.url);
    notify("图片已上传");
  } catch (e) {
    void showError(errorMessage(e), "图片上传未完成");
  } finally {
    busy.value = false;
    input.value = "";
  }
}
defineExpose({ open });
</script>
<template>
  <dialog
    ref="dialog"
    class="media-dialog"
    aria-labelledby="media-picker-title"
  >
    <div class="panel-heading">
      <div>
        <h2 id="media-picker-title">选择图片</h2>
        <p class="muted small-text">
          JPG / PNG / GIF，单张不超过 8MB；GIF 仅保留首帧。
        </p>
      </div>
      <button
        class="icon-btn"
        aria-label="关闭图片选择"
        @click="dialog?.close()"
      >
        <Icon name="close" />
      </button>
    </div>
    <label class="btn primary upload-label" :class="{ disabled: busy }"
      ><Icon name="plus" :size="17" />{{ busy ? "正在上传…" : "上传新图片"
      }}<input
        type="file"
        accept="image/jpeg,image/png,image/gif"
        :disabled="busy"
        @change="add"
    /></label>
    <div v-if="error" class="error-panel">
      {{ error }} <button @click="load()">重试</button>
    </div>
    <div v-else-if="loading" class="loading-panel">正在读取图片…</div>
    <div v-else-if="!result.items.length" class="empty-panel">
      图片库还是空的，可以上传第一张图片。
    </div>
    <div v-else class="media-picker-grid">
      <button
        v-for="image in result.items"
        :key="image.id"
        @click="choose(image.url)"
      >
        <img
          :src="image.url"
          :alt="image.original_name"
          loading="lazy"
        /><span>{{ image.original_name }}</span>
      </button>
    </div>
    <Pagination :page="result.page" :pages="result.pages" @change="load" />
  </dialog>
</template>
