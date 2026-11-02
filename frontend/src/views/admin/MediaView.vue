<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, upload, notify, errorMessage } from "../../lib/api";
import type { Upload, Page } from "../../lib/types";
import Icon from "../../components/Icon.vue";
import Pagination from "../../components/Pagination.vue";
const result = ref<Page<Upload>>({ items: [], total: 0, page: 1, pages: 0 }),
  loading = ref(false),
  busy = ref(false),
  error = ref("");
async function load(page = 1) {
  loading.value = true;
  error.value = "";
  try {
    result.value = await api<Page<Upload>>(`/admin/uploads?page=${page}`);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function add(event: Event) {
  const input = event.target as HTMLInputElement,
    files = [...(input.files || [])];
  busy.value = true;
  let count = 0;
  try {
    for (const file of files) {
      await upload(file);
      count++;
    }
    if (count) notify(`已上传 ${count} 张图片`);
  } catch (e) {
    notify(`${count ? `已上传 ${count} 张。` : ""}${errorMessage(e)}`, "error");
  } finally {
    busy.value = false;
    input.value = "";
    await load();
  }
}
async function remove(image: Upload) {
  if (!confirm(`确定删除图片“${image.original_name}”吗？`)) return;
  try {
    await api(`/admin/uploads/${image.id}`, { method: "DELETE" });
    notify("图片已删除");
    await load(
      result.value.items.length === 1
        ? Math.max(1, result.value.page - 1)
        : result.value.page,
    );
  } catch (e) {
    notify(errorMessage(e), "error");
  }
}
async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    notify("图片地址已复制");
  } catch {
    notify("复制失败，请在图片上右键复制地址", "error");
  }
}
onMounted(() => load());
</script>
<template>
  <div class="admin-page-heading">
    <div>
      <p class="eyebrow">PICTURES WORTH KEEPING</p>
      <h1>图片库<span class="heading-dot">.</span></h1>
      <p>上传的图片保存在服务器本地，可用于封面、正文和动态配图。</p>
    </div>
    <label class="btn primary upload-label" :class="{ disabled: busy }"
      ><Icon name="plus" :size="18" />{{ busy ? "正在上传…" : "上传图片"
      }}<input
        type="file"
        accept="image/jpeg,image/png,image/gif"
        multiple
        :disabled="busy"
        @change="add"
    /></label>
  </div>
  <div class="info-strip">
    支持 JPG、PNG、GIF，单张最多 8MB、1600 万像素。GIF
    仅保留首帧。正在使用的图片无法删除。
  </div>
  <div v-if="loading" class="loading-panel">正在整理图片…</div>
  <div v-else-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load()">重试</button>
  </div>
  <div v-else-if="!result.items.length" class="empty-panel admin-panel">
    <Icon name="image" :size="34" />
    <h3>第一张图片，会是什么？</h3>
    <p>上传后，可以在编辑内容时直接选用。</p>
  </div>
  <div v-else class="media-grid">
    <article
      v-for="image in result.items"
      :key="image.id"
      class="media-card admin-panel"
    >
      <a :href="image.url" target="_blank" rel="noopener noreferrer"
        ><img :src="image.url" :alt="image.original_name" loading="lazy"
      /></a>
      <div>
        <strong :title="image.original_name">{{ image.original_name }}</strong
        ><span
          >{{ image.width }} × {{ image.height }} ·
          {{ Math.ceil(image.size_bytes / 1024) }} KB</span
        >
        <div class="media-actions">
          <button class="text-link" @click="copy(image.url)">
            <Icon name="link" :size="15" />复制地址</button
          ><button class="text-link danger-text" @click="remove(image)">
            <Icon name="trash" :size="15" />删除
          </button>
        </div>
      </div>
    </article>
  </div>
  <Pagination :page="result.page" :pages="result.pages" @change="load" />
</template>
