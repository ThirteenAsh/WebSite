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
const editing = ref<Upload[]>([]);
const selected = ref(new Map<number, Upload>());
const newGroup = ref("0");
const busy = ref(false);
const groups = computed(() => library.value?.groups || []);

function groupName(id: number) {
  const group = groups.value.find((item) => item.id === id);
  if (!group) return id ? "内容 #" + id : "未归类";
  return group.title || formatDate(group.created_at) + " 日常 #" + group.id;
}
function toggleSelection(images: Upload[], checked: boolean) {
  for (const image of images) {
    if (checked) selected.value.set(image.id, image);
    else selected.value.delete(image.id);
  }
}
function editGroup(images: Upload[]) {
  editing.value = images;
  newGroup.value =
    images.length === 1 ? String(images[0]?.content_id || 0) : "";
  groupDialog.value?.showModal();
}
function closeGroup() {
  if (!busy.value) groupDialog.value?.close();
}
async function applyChanges(images: Upload[], action: "group" | "delete") {
  if (!images.length || busy.value) return;
  const grouping = action === "group";
  const verb = grouping ? "归类" : "删除";
  const groupId = Number(newGroup.value) || null;
  busy.value = true;
  const errors: string[] = [];
  try {
    for (const image of images) {
      try {
        const path = `/admin/uploads/${image.id}`;
        if (grouping) {
          await api(`${path}/group`, {
            method: "PUT",
            body: JSON.stringify({ content_id: groupId }),
          });
        } else {
          await api(path, { method: "DELETE" });
        }
        selected.value.delete(image.id);
      } catch (e) {
        errors.push(`${image.original_name}：${errorMessage(e)}`);
      }
    }
    const succeeded = images.length - errors.length;
    if (succeeded) {
      if (grouping) groupDialog.value?.close();
      notify(`已${verb} ${succeeded} 张图片`);
      const result = library.value?.result;
      const page =
        !grouping && images.length === 1 && result
          ? Math.max(1, result.page - Number(result.items.length === 1))
          : 1;
      await library.value?.load(page);
    }
    if (errors.length) {
      const detail = errors.slice(0, 4).join("\n");
      void showError(
        `${errors.length} 张图片未能${verb}。\n${detail}${errors.length > 4 ? "\n…" : ""}`,
        `图片${verb}未完成`,
      );
    }
  } finally {
    busy.value = false;
  }
}
async function remove(images: Upload[]) {
  if (!images.length || busy.value) return;
  const target =
    images.length === 1
      ? `图片“${images[0]?.original_name}”`
      : `选中的 ${images.length} 张图片`;
  if (
    !(await confirmAction(`确定删除${target}吗？删除后无法恢复。`, {
      title: "删除图片",
      tone: "danger",
      confirmText: "确认删除",
    }))
  )
    return;
  await applyChanges(images, "delete");
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
    <template #toolbar="{ items }">
      <div class="media-selection">
        <button
          type="button"
          class="btn secondary small"
          :disabled="busy || !items.length"
          @click="
            toggleSelection(
              items,
              !items.every((image) => selected.has(image.id)),
            )
          "
        >
          {{
            items.length && items.every((image) => selected.has(image.id))
              ? "取消本页全选"
              : "全选本页"
          }}
        </button>
        <span role="status">已选 {{ selected.size }} 张</span>
        <template v-if="selected.size">
          <button
            type="button"
            class="btn secondary small"
            :disabled="busy"
            @click="editGroup([...selected.values()])"
          >
            批量归类
          </button>
          <button
            type="button"
            class="btn secondary small danger-text"
            :disabled="busy"
            @click="remove([...selected.values()])"
          >
            批量删除
          </button>
          <button
            type="button"
            class="text-link"
            :disabled="busy"
            @click="selected.clear()"
          >
            清空选择
          </button>
        </template>
      </div>
    </template>
    <template #actions="{ image }">
      <span
        v-if="image.content_id"
        class="media-card-group"
        :title="groupName(image.content_id)"
        >{{ groupName(image.content_id) }}</span
      >
      <div class="media-actions">
        <input
          type="checkbox"
          :aria-label="`选择 ${image.original_name}`"
          :checked="selected.has(image.id)"
          :disabled="busy"
          @change="
            toggleSelection(
              [image],
              ($event.target as HTMLInputElement).checked,
            )
          "
        />
        <button
          type="button"
          class="text-link"
          :disabled="busy"
          @click="editGroup([image])"
        >
          <Icon name="edit" :size="15" />归类
        </button>
        <button type="button" class="text-link" @click="copy(image.url)">
          <Icon name="link" :size="15" />复制地址
        </button>
        <button
          type="button"
          class="text-link danger-text"
          :disabled="busy"
          @click="remove([image])"
        >
          <Icon name="trash" :size="15" />删除
        </button>
      </div>
    </template>
  </MediaLibrary>
  <MediaPicker
    ref="picker"
    upload-only
    :content-id="Number(scope) || 0"
    :upload-groups="groups"
    @finished="library?.load()"
  />
  <dialog
    ref="groupDialog"
    class="media-group-dialog"
    aria-labelledby="media-group-heading"
    @cancel.prevent="closeGroup"
  >
    <form @submit.prevent="newGroup && applyChanges(editing, 'group')">
      <div class="panel-heading">
        <div>
          <h2 id="media-group-heading">图片归类</h2>
          <p class="muted small-text">
            {{
              editing.length === 1
                ? editing[0]?.original_name
                : `已选 ${editing.length} 张图片`
            }}
          </p>
        </div>
        <button
          type="button"
          class="icon-btn"
          aria-label="关闭图片归类"
          :disabled="busy"
          @click="closeGroup"
        >
          <Icon name="close" />
        </button>
      </div>
      <fieldset :disabled="busy">
        <MediaGroupSelect
          v-model="newGroup"
          :groups="groups"
          label="归入分类"
        />
        <button type="submit" class="btn primary" :disabled="!newGroup">
          保存分类
        </button>
      </fieldset>
    </form>
  </dialog>
</template>

<style scoped>
.media-selection {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 14px;
}
.media-selection > span {
  font-size: 13px;
  color: var(--muted);
}
.media-actions {
  align-items: center;
}
</style>
