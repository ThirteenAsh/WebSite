<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { formatDate, type Upload, type UploadGroup } from "../lib/types";
import Icon from "./Icon.vue";
import ImageUploadQueue from "./ImageUploadQueue.vue";
import MediaLibrary from "./MediaLibrary.vue";
import MediaGroupSelect from "./MediaGroupSelect.vue";

const props = defineProps<{
  contentId?: number;
  uploadGroups?: UploadGroup[];
  uploadOnly?: boolean;
  uploadLimit?: number;
}>();
const emit = defineEmits<{
  select: [url: string];
  uploaded: [image: Upload];
  uploading: [busy: boolean];
  finished: [];
}>();
const titleId = useId();
const dialog = ref<HTMLDialogElement>();
const scroll = ref<HTMLElement>();
const queue = ref<InstanceType<typeof ImageUploadQueue>>();
const library = ref<InstanceType<typeof MediaLibrary>>();
const opened = ref(false);
const uploading = ref(false);
const scope = ref("");
const view = ref<"library" | "upload">("library");
const destinationId = ref(props.contentId);
const destinationLocked = computed(
  () => uploading.value || queue.value?.hasFailed,
);
const uploadGroup = computed({
  get: () => String(destinationId.value || 0),
  set: (value: string) => {
    if (!destinationLocked.value) destinationId.value = Number(value);
  },
});
const destinationLabel = computed(() => {
  const id = destinationId.value;
  if (props.uploadGroups) {
    if (!id) return "未归类";
    const group = props.uploadGroups.find((item) => item.id === id);
    return group
      ? group.title || `${formatDate(group.created_at)} 日常 #${id}`
      : `内容 #${id}`;
  }
  if (id) return "当前内容";
  return id === 0 ? "未归类，首次保存后归档" : "未归类";
});
let refreshLibrary = false;

async function open() {
  if (opened.value) return;
  if (!queue.value?.hasPending) {
    queue.value?.reset();
    destinationId.value = props.contentId;
  }
  scope.value = props.contentId === undefined ? "" : String(props.contentId);
  view.value =
    props.uploadOnly || queue.value?.hasPending ? "upload" : "library";
  refreshLibrary = false;
  opened.value = true;
  await nextTick();
  dialog.value?.showModal();
  if (scroll.value) scroll.value.scrollTop = 0;
}
function close() {
  if (!uploading.value) dialog.value?.close();
}
function choose(url: string) {
  if (uploading.value || !dialog.value?.open) return;
  close();
  emit("select", url);
}
function switchView(next: "library" | "upload") {
  view.value = next;
  if (scroll.value) scroll.value.scrollTop = 0;
  if (next === "library" && refreshLibrary) {
    refreshLibrary = false;
    void library.value?.load();
  }
}
function setUploading(value: boolean) {
  uploading.value = value;
  emit("uploading", value);
}
function finished() {
  refreshLibrary = true;
  emit("finished");
}
defineExpose({ open });
</script>

<template>
  <dialog
    ref="dialog"
    class="media-dialog"
    :aria-labelledby="titleId"
    @cancel.prevent="close"
    @close="opened = false"
  >
    <header class="media-dialog-heading">
      <div>
        <p class="eyebrow">MEDIA LIBRARY</p>
        <h2 :id="titleId">{{ uploadOnly ? "上传图片" : "选择图片" }}</h2>
        <p class="muted small-text">
          {{
            uploadOnly
              ? "先确认队列，再开始上传。"
              : "按内容找图，点缩略图预览大图。"
          }}
        </p>
      </div>
      <button
        type="button"
        class="icon-btn"
        aria-label="关闭图片选择"
        :disabled="uploading"
        autofocus
        @click="close"
      >
        <Icon name="close" />
      </button>
    </header>
    <div
      v-if="!uploadOnly"
      class="media-dialog-tabs"
      role="group"
      aria-label="图片操作"
    >
      <button
        type="button"
        :aria-pressed="view === 'library'"
        :disabled="uploading"
        @click="switchView('library')"
      >
        <Icon name="grid" :size="16" />图片库
      </button>
      <button
        type="button"
        :aria-pressed="view === 'upload'"
        :disabled="uploading"
        @click="switchView('upload')"
      >
        <Icon name="plus" :size="17" />上传队列
      </button>
    </div>
    <div
      v-if="opened && uploadGroups && view === 'upload'"
      class="media-upload-destination"
    >
      <span>上传分类</span>
      <MediaGroupSelect
        v-model="uploadGroup"
        :groups="uploadGroups"
        :disabled="destinationLocked"
        label="上传分类"
      />
      <p v-if="queue?.hasFailed && !uploading" class="muted small-text">
        重试沿用本批分类。移除失败项后可更改分类。
      </p>
    </div>
    <div ref="scroll" class="media-dialog-scroll">
      <MediaLibrary
        v-if="opened && !uploadOnly"
        v-show="view === 'library'"
        ref="library"
        v-model="scope"
        picker
      >
        <template #actions="{ image }">
          <button
            type="button"
            class="btn secondary media-use"
            :aria-label="'使用 ' + image.original_name"
            @click="choose(image.url)"
          >
            使用图片<Icon name="right" :size="15" />
          </button>
        </template>
      </MediaLibrary>
      <ImageUploadQueue
        v-show="view === 'upload'"
        ref="queue"
        :content-id="destinationId"
        :destination="destinationLabel"
        :limit="uploadLimit"
        :selectable="!uploadOnly"
        @select="choose"
        @uploading="setUploading"
        @uploaded="emit('uploaded', $event)"
        @finished="finished"
      />
    </div>
  </dialog>
</template>
