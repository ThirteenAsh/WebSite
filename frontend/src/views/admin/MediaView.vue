<script setup lang="ts">
import { computed, ref } from "vue";
import { api, notify, errorMessage } from "../../lib/api";
import { confirmAction, showError } from "../../lib/dialogs";
import { formatDate, type Upload } from "../../lib/types";
import Icon from "../../components/Icon.vue";
import MediaGroupSelect from "../../components/MediaGroupSelect.vue";
import MediaLibrary from "../../components/MediaLibrary.vue";
import MediaPicker from "../../components/MediaPicker.vue";

const scope = ref("");
const library = ref<InstanceType<typeof MediaLibrary>>();
const picker = ref<InstanceType<typeof MediaPicker>>();
const groupDialog = ref<HTMLDialogElement>();
const editing = ref<Upload>();
const newGroup = ref("0");
const moving = ref(false);
const groups = computed(() => library.value?.groups || []);

function groupName(id: number) {
  const group = groups.value.find((item) => item.id === id);
  if (!group) return id ? "内容 #" + id : "未归类";
  return group.title || formatDate(group.created_at) + " 日常 #" + group.id;
}
function editGroup(image: Upload) {
  editing.value = image;
  newGroup.value = String(image.content_id || 0);
  groupDialog.value?.showModal();
}
function closeGroup() {
  if (!moving.value) groupDialog.value?.close();
}
async function move() {
  if (!editing.value || moving.value) return;
  moving.value = true;
  try {
    await api(`/admin/uploads/${editing.value.id}/group`, {
      method: "PUT",
      body: JSON.stringify({ content_id: Number(newGroup.value) || null }),
    });
    groupDialog.value?.close();
    notify("图片已归类");
    await library.value?.load();
  } catch (e) {
    void showError(errorMessage(e), "图片归类未完成");
  } finally {
    moving.value = false;
  }
}
async function remove(image: Upload) {
  if (
    !(await confirmAction(
      `确定删除图片“${image.original_name}”吗？删除后无法恢复。`,
      {
        title: "删除图片",
        tone: "danger",
        confirmText: "确认删除",
      },
    ))
  )
    return;
  try {
    await api(`/admin/uploads/${image.id}`, { method: "DELETE" });
    notify("图片已删除");
    const result = library.value?.result;
    await library.value?.load(
      result && result.items.length === 1
        ? Math.max(1, result.page - 1)
        : result?.page,
    );
  } catch (e) {
    void showError(errorMessage(e));
  }
}
async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    notify("图片地址已复制");
  } catch {
    void showError("复制失败，请打开大图后复制地址");
  }
}
</script>

<template>
  <div class="admin-page-heading">
    <div>
      <p class="eyebrow">PICTURES WORTH KEEPING</p>
      <h1>图片库<span class="heading-dot">.</span></h1>
      <p>按文章、作品和日常查看图片，或按文件名查找。</p>
    </div>
    <button type="button" class="btn primary" @click="picker?.open()">
      <Icon name="plus" :size="18" />批量上传
    </button>
  </div>
  <MediaLibrary ref="library" v-model="scope">
    <template #actions="{ image }">
      <span
        v-if="image.content_id"
        class="media-card-group"
        :title="groupName(image.content_id)"
        >{{ groupName(image.content_id) }}</span
      >
      <div class="media-actions">
        <button type="button" class="text-link" @click="editGroup(image)">
          <Icon name="edit" :size="15" />归类
        </button>
        <button type="button" class="text-link" @click="copy(image.url)">
          <Icon name="link" :size="15" />复制地址
        </button>
        <button
          type="button"
          class="text-link danger-text"
          @click="remove(image)"
        >
          <Icon name="trash" :size="15" />删除
        </button>
      </div>
    </template>
  </MediaLibrary>
  <MediaPicker
    ref="picker"
    upload-only
    :content-id="Number(scope)"
    :upload-groups="groups"
    @finished="library?.load()"
  />
  <dialog
    ref="groupDialog"
    class="media-group-dialog"
    aria-labelledby="media-group-heading"
    @cancel.prevent="closeGroup"
  >
    <form @submit.prevent="move">
      <div class="panel-heading">
        <div>
          <h2 id="media-group-heading">图片归类</h2>
          <p class="muted small-text">{{ editing?.original_name }}</p>
        </div>
        <button
          type="button"
          class="icon-btn"
          aria-label="关闭图片归类"
          :disabled="moving"
          @click="closeGroup"
        >
          <Icon name="close" />
        </button>
      </div>
      <fieldset :disabled="moving">
        <MediaGroupSelect
          v-model="newGroup"
          :groups="groups"
          label="归入分类"
        />
        <button type="submit" class="btn primary">保存分类</button>
      </fieldset>
    </form>
  </dialog>
</template>
