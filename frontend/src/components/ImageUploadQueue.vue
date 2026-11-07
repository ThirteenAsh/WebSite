<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { errorMessage, imageFileError, notify, upload } from "../lib/api";
import type { Upload } from "../lib/types";
import Icon from "./Icon.vue";

const props = defineProps<{
  contentId?: number;
  destination: string;
  limit?: number;
  selectable?: boolean;
}>();
const emit = defineEmits<{
  uploading: [busy: boolean];
  uploaded: [image: Upload];
  finished: [];
  select: [url: string];
}>();
type QueueItem = {
  key: string;
  file: File;
  state: "waiting" | "uploading" | "failed" | "done";
  percent: number;
  error?: string;
  image?: Upload;
};
const items = ref<QueueItem[]>([]);
const busy = ref(false);
const notice = ref("");
const pending = computed(() =>
  items.value.filter((item) => item.state !== "done"),
);
const limit = computed(() => props.limit ?? 50);
const done = computed(() => items.value.length - pending.value.length);
let controller: AbortController | undefined;

function enqueue(files: File[]) {
  if (busy.value || !files.length) return;
  if (files.length + pending.value.length > limit.value) {
    notice.value = `队列还可添加 ${Math.max(0, limit.value - pending.value.length)} 张图片。`;
    return;
  }
  const errors: string[] = [];
  for (const file of files) {
    const message = imageFileError(file);
    if (message) {
      errors.push(`${file.name}（${message}）`);
      continue;
    }
    const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    items.value.push({ key, file, state: "waiting", percent: 0 });
  }
  notice.value = errors.length ? `无法加入队列：${errors.join("、")}` : "";
}
function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  enqueue(Array.from(input.files || []));
  input.value = "";
}
async function start() {
  if (busy.value || !pending.value.length) return;
  const batch = [...pending.value];
  if (batch.length > limit.value) {
    notice.value = `本次最多上传 ${limit.value} 张，请先移除多余的图片。`;
    return;
  }
  const contentId = props.contentId;
  controller = new AbortController();
  const signal = controller.signal;
  busy.value = true;
  emit("uploading", true);
  let succeeded = 0;
  try {
    for (const item of batch) {
      if (signal.aborted) break;
      item.state = "uploading";
      item.percent = 0;
      item.error = undefined;
      try {
        const image = await upload(item.file, {
          contentId,
          key: item.key,
          progress: (percent) => (item.percent = percent),
          signal,
        });
        if (signal.aborted) break;
        item.image = image;
        item.state = "done";
        succeeded++;
        emit("uploaded", image);
      } catch (e) {
        if (signal.aborted) break;
        item.state = "failed";
        item.error = errorMessage(e);
      }
    }
  } finally {
    controller = undefined;
    busy.value = false;
    if (!signal.aborted) {
      emit("uploading", false);
      if (succeeded) {
        emit("finished");
        notify(`已上传 ${succeeded} 张图片`);
      }
    }
  }
}
onBeforeUnmount(() => controller?.abort());
defineExpose({
  hasPending: computed(() => pending.value.length > 0),
  hasFailed: computed(() =>
    pending.value.some((item) => item.state === "failed"),
  ),
  reset() {
    items.value = [];
    notice.value = "";
  },
});
</script>

<template>
  <div class="image-upload-queue">
    <div
      class="upload-queue-drop"
      :class="{ 'has-files': items.length }"
      @dragover.prevent
      @drop.prevent="enqueue(Array.from($event.dataTransfer?.files || []))"
    >
      <div>
        <strong>{{ items.length ? "上传队列" : "选择或拖入图片" }}</strong>
        <p class="muted small-text">
          上传到 {{ destination }} · JPG / PNG / GIF，单张不超过 8 MB
        </p>
      </div>
      <label
        class="btn secondary upload-label"
        :class="{ disabled: busy || pending.length >= limit }"
      >
        <Icon name="plus" :size="17" />{{
          items.length ? "继续选择" : "选择图片文件"
        }}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif"
          aria-label="选择图片文件"
          :disabled="busy || pending.length >= limit"
          @change="selectFiles"
        />
      </label>
    </div>
    <p v-if="notice" class="error-panel upload-queue-notice" role="alert">
      {{ notice }}
    </p>
    <ul
      v-if="items.length"
      class="upload-queue-list"
      aria-label="待上传图片和进度"
    >
      <li
        v-for="(item, index) in items"
        :key="item.key"
        class="upload-queue-item"
        :data-state="item.state"
      >
        <Icon name="image" :size="20" />
        <div class="upload-queue-file">
          <strong :title="item.file.name">{{ item.file.name }}</strong>
          <span class="muted"
            >{{ Math.max(1, Math.ceil(item.file.size / 1024)) }} KB</span
          >
        </div>
        <div class="upload-queue-state">
          <template v-if="item.state === 'uploading'">
            <progress
              :value="item.percent"
              max="100"
              :aria-label="`上传 ${item.file.name}`"
            />
            <span>{{
              item.percent === 100 ? "正在处理" : `${item.percent}%`
            }}</span>
          </template>
          <span v-else-if="item.state === 'failed'" class="danger-text">{{
            item.error
          }}</span>
          <span v-else>{{
            item.state === "done" ? "上传完成" : "等待上传"
          }}</span>
        </div>
        <div class="upload-queue-item-actions">
          <button
            v-if="selectable && item.image"
            type="button"
            class="text-link"
            :disabled="busy"
            :aria-label="`使用 ${item.file.name}`"
            @click="emit('select', item.image.url)"
          >
            使用图片
          </button>
          <button
            type="button"
            class="icon-btn"
            :disabled="busy"
            :aria-label="`移除队列中的 ${item.file.name}`"
            @click="items.splice(index, 1)"
          >
            <Icon name="close" :size="16" />
          </button>
        </div>
      </li>
    </ul>
    <div v-if="items.length" class="upload-queue-footer">
      <span class="muted small-text" role="status"
        >{{ done }} 张已完成 · {{ pending.length }} 张未完成</span
      >
      <button
        v-if="done"
        type="button"
        class="text-link"
        :disabled="busy"
        @click="items = pending"
      >
        清除已完成
      </button>
      <button
        type="button"
        class="btn primary"
        :disabled="busy || !pending.length"
        @click="start"
      >
        {{
          busy
            ? "上传中…"
            : pending.length && pending.every((item) => item.state === "failed")
              ? "重试失败项"
              : "开始上传"
        }}
      </button>
    </div>
  </div>
</template>
