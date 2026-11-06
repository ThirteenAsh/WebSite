<script setup lang="ts">
import { computed, ref } from "vue";
import { errorMessage, notify, upload } from "../lib/api";
import { showError } from "../lib/dialogs";
import Icon from "./Icon.vue";
import MediaPicker from "./MediaPicker.vue";

const images = defineModel<string[]>({ required: true });
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ uploading: [value: boolean] }>();
const picker = ref<InstanceType<typeof MediaPicker>>();
const uploading = ref(false),
  dragged = ref<number | null>(null),
  announcement = ref("");
const locked = computed(() => props.disabled || uploading.value);

function move(from: number, to: number) {
  if (
    locked.value ||
    from === to ||
    from < 0 ||
    from >= images.value.length ||
    to < 0 ||
    to >= images.value.length
  )
    return;
  const reordered = [...images.value];
  const [src] = reordered.splice(from, 1);
  reordered.splice(to, 0, src!);
  images.value = reordered;
  announcement.value = `第 ${from + 1} 张图片已移到第 ${to + 1} 位`;
}
function startDrag(event: DragEvent, index: number) {
  if (locked.value) {
    event.preventDefault();
    return;
  }
  dragged.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }
}
function drop(index: number) {
  if (dragged.value !== null) move(dragged.value, index);
  dragged.value = null;
}
function select(url: string) {
  if (locked.value) return;
  if (images.value.length >= 9) {
    void showError("每条日常最多添加 9 张图片", "图片数量已达上限");
    return;
  }
  images.value = [...images.value, url];
}
async function add(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (locked.value || !files.length) return;
  if (files.length + images.value.length > 9) {
    void showError(
      `还可以添加 ${9 - images.value.length} 张图片，请重新选择。`,
      "每条日常最多 9 张图片",
    );
    return;
  }
  const invalid = files.find(
    (file) =>
      !["image/jpeg", "image/png", "image/gif"].includes(file.type) ||
      file.size > 8 * 1024 * 1024,
  );
  if (invalid) {
    void showError(
      "请选择 JPG、PNG 或 GIF 图片，单张不超过 8MB。",
      "图片格式或大小不符合要求",
    );
    return;
  }
  uploading.value = true;
  emit("uploading", true);
  let added = 0;
  try {
    for (const file of files) {
      const image = await upload(file);
      images.value = [...images.value, image.url];
      added++;
    }
    notify(`已添加 ${added} 张图片`);
  } catch (e) {
    void showError(
      `${errorMessage(e)}${added ? `。已上传的 ${added} 张图片已保留，可继续添加其余图片。` : ""}`,
      "图片上传未完成",
    );
  } finally {
    uploading.value = false;
    emit("uploading", false);
  }
}
</script>

<template>
  <div class="moment-images-editor">
    <div class="moment-images-heading">
      <span
        >图片 <span class="muted">{{ images.length }} / 9</span></span
      >
      <span v-if="images.length > 1" class="muted"
        >拖动图片或用箭头调整顺序</span
      >
    </div>
    <div
      v-if="images.length"
      class="moment-edit-grid"
      role="group"
      aria-label="日常图片排序"
    >
      <div
        v-for="(src, i) in images"
        :key="i"
        class="moment-edit-image"
        :class="{ dragging: dragged === i }"
        :draggable="!locked"
        @dragstart="startDrag($event, i)"
        @dragend="dragged = null"
        @dragover.prevent
        @drop.prevent="drop(i)"
      >
        <img :src="src" :alt="`第 ${i + 1} 张配图`" draggable="false" />
        <span class="moment-image-number">{{ i + 1 }}</span>
        <button
          class="moment-image-remove"
          :aria-label="`移除第 ${i + 1} 张配图`"
          :disabled="locked"
          @click="images = images.filter((_, index) => index !== i)"
        >
          <Icon name="close" :size="16" />
        </button>
        <div class="moment-image-moves">
          <button
            :aria-label="`前移第 ${i + 1} 张图片`"
            :disabled="locked || i === 0"
            @click="move(i, i - 1)"
          >
            <Icon name="back" :size="16" />
          </button>
          <button
            :aria-label="`后移第 ${i + 1} 张图片`"
            :disabled="locked || i === images.length - 1"
            @click="move(i, i + 1)"
          >
            <Icon name="right" :size="16" />
          </button>
        </div>
      </div>
    </div>
    <div class="moment-image-actions">
      <label
        class="btn secondary upload-label"
        :class="{ disabled: locked || images.length >= 9 }"
      >
        <Icon name="plus" :size="17" />{{
          uploading ? "正在上传…" : "上传图片"
        }}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif"
          aria-label="上传日常图片"
          :disabled="locked || images.length >= 9"
          @change="add"
        />
      </label>
      <button
        class="text-link"
        :disabled="locked || images.length >= 9"
        @click="picker?.open()"
      >
        从图片库选择
      </button>
      <span v-if="images.length >= 9" class="muted small-text"
        >已添加 9 张图片</span
      >
    </div>
    <p class="sr-only" role="status">{{ announcement }}</p>
    <MediaPicker ref="picker" @select="select" />
  </div>
</template>

<style scoped>
.moment-images-heading {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 14px;
}
.moment-images-heading > span:first-child {
  font-weight: 600;
}
.moment-images-heading .muted {
  font-weight: 400;
}
.moment-edit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-width: 460px;
}
.moment-edit-image {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  background: var(--code);
  cursor: grab;
}
.moment-edit-image.dragging {
  opacity: 0.45;
}
.moment-edit-image > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.moment-image-number,
.moment-image-remove,
.moment-image-moves {
  position: absolute;
  background: #29221dcc;
  color: white;
  border: 0;
}
.moment-image-number {
  top: 6px;
  left: 6px;
  font-size: 11px;
  border-radius: 4px;
  padding: 0 6px;
}
.moment-image-remove {
  top: 5px;
  right: 5px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  padding: 0;
}
.moment-image-moves {
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
}
.moment-image-moves button {
  color: white;
  border: 0;
  min-width: 38px;
  height: 30px;
  padding: 0;
}
.moment-image-moves button:disabled {
  opacity: 0.25;
}
.moment-image-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 18px;
  margin-top: 16px;
  font-size: 12px;
}
.moment-image-actions .btn {
  font-size: 12px;
}
</style>
