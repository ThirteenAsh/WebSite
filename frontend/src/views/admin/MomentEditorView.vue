<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from "vue-router";
import { api, errorMessage, notify } from "../../lib/api";
import { confirmAction, showError } from "../../lib/dialogs";
import {
  adminContentPath,
  blankContent,
  contentPath,
  type Content,
  type Upload,
} from "../../lib/types";
import Gallery from "../../components/Gallery.vue";
import Icon from "../../components/Icon.vue";
import AdminBackLink from "../../components/AdminBackLink.vue";
import MarkdownBody from "../../components/MarkdownBody.vue";
import MomentImagesEditor from "../../components/MomentImagesEditor.vue";

const route = useRoute(),
  router = useRouter();
const content = ref<Content>(blankContent("moment"));
const loading = ref(true),
  busy = ref(false),
  uploading = ref(false),
  preview = ref(false),
  error = ref(""),
  baseline = ref("");
const payload = computed(() => ({
  kind: "moment",
  body: content.value.body,
  images: content.value.images,
  status: content.value.status,
}));
const serialized = computed(() => JSON.stringify(payload.value));
const dirty = computed(
  () =>
    !loading.value && !!baseline.value && serialized.value !== baseline.value,
);
const locked = computed(() => busy.value || uploading.value);
const pendingUploads = new Set<number>();
function rememberUpload(image: Upload) {
  if (!content.value.id) pendingUploads.add(image.id);
}
let request = 0;
async function load() {
  const id = ++request;
  pendingUploads.clear();
  loading.value = true;
  error.value = "";
  preview.value = false;
  try {
    const c = route.params.id
      ? await api<Content>(`/admin/contents/${route.params.id}`)
      : blankContent("moment");
    if (id !== request) return;
    if (c.kind !== "moment") {
      baseline.value = "";
      await router.replace(adminContentPath(c));
      return;
    }
    content.value = c;
    baseline.value = serialized.value;
  } catch (e) {
    if (id === request) error.value = errorMessage(e);
  } finally {
    if (id === request) loading.value = false;
  }
}
watch(() => route.params.id, load, { immediate: true });
async function save(status: Content["status"]) {
  if (locked.value || loading.value || error.value) return;
  if (!content.value.body.trim() && !content.value.images.length) {
    void showError("写点什么，或者添加一张图片。", "这条日常还是空的");
    return;
  }
  if (content.value.images.length > 9) {
    void showError("每条日常最多添加 9 张图片。", "图片数量超过上限");
    return;
  }
  busy.value = true;
  try {
    const isNew = !content.value.id;
    const data = {
      ...payload.value,
      status,
      ...(isNew && pendingUploads.size
        ? { upload_ids: [...pendingUploads] }
        : {}),
    };
    const saved = await api<{ id: number }>(
      isNew ? "/admin/contents" : `/admin/contents/${content.value.id}`,
      { method: isNew ? "POST" : "PUT", body: JSON.stringify(data) },
    );
    content.value.id = saved.id;
    content.value.status = status;
    baseline.value = serialized.value;
    notify(status === "published" ? "日常已发布" : "已保存到草稿箱");
    if (isNew) {
      // 保存成功后已没有待保存的修改，允许跳转到新日常的编辑地址。
      busy.value = false;
      await router.replace(adminContentPath(content.value));
    }
  } catch (e) {
    void showError(errorMessage(e), "日常未保存");
  } finally {
    busy.value = false;
  }
}
function confirmLeave() {
  if (busy.value || uploading.value) {
    notify(
      uploading.value ? "图片正在上传，请稍等片刻。" : "正在保存，请稍等片刻。",
      "info",
    );
    return false;
  }
  return (
    !dirty.value ||
    confirmAction("还有未保存的修改，离开后这些修改将丢失。", {
      title: "离开编辑器？",
      tone: "warning",
      confirmText: "放弃修改并离开",
      cancelText: "继续编辑",
    })
  );
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(
  (to, from) =>
    to.params.id === from.params.id ||
    (!dirty.value && !uploading.value) ||
    confirmLeave(),
);
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || locked.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function keyboard(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (!document.querySelector("dialog[open]"))
      void save(content.value.status);
  }
}
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("keydown", keyboard);
});
onBeforeUnmount(() => {
  request++;
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("keydown", keyboard);
});
</script>

<template>
  <div v-if="loading" class="loading-panel">正在打开日常…</div>
  <div v-else-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button>
    <AdminBackLink to="/admin/moments" label="日常管理" />
  </div>
  <div v-else class="moment-editor-page">
    <div class="editor-heading">
      <div>
        <AdminBackLink to="/admin/moments" label="日常管理" />
        <h1>{{ content.id ? "编辑日常" : "今天，想分享什么？" }}</h1>
        <span class="muted small-text">{{
          dirty
            ? "有未保存的修改"
            : content.id
              ? "修改已保存"
              : "支持 Markdown 配文，最多 9 张图片"
        }}</span>
      </div>
      <div class="editor-save-actions">
        <RouterLink
          v-if="content.id && content.status === 'published'"
          :to="contentPath(content)"
          target="_blank"
          class="text-link"
          >查看日常<Icon name="arrow" :size="15"
        /></RouterLink>
        <button class="btn secondary" :disabled="locked" @click="save('draft')">
          {{ content.status === "published" ? "撤回为草稿" : "保存草稿" }}
        </button>
        <button
          class="btn primary"
          :disabled="locked"
          @click="save('published')"
        >
          {{
            busy
              ? "正在保存…"
              : content.status === "published"
                ? "保存并更新"
                : "发布日常"
          }}
        </button>
      </div>
    </div>
    <section class="moment-composer">
      <div class="moment-composer-heading">
        <span class="status-badge" :class="content.status">{{
          content.status === "published" ? "已发布" : "草稿"
        }}</span>
        <button
          class="text-link"
          :disabled="locked"
          :aria-pressed="preview"
          @click="preview = !preview"
        >
          {{ preview ? "继续编辑" : "预览日常" }}
        </button>
      </div>
      <fieldset :disabled="locked" class="moment-composer-fields">
        <template v-if="!preview">
          <label class="sr-only" for="moment-body">Markdown 配文</label>
          <textarea
            id="moment-body"
            v-model="content.body"
            rows="8"
            spellcheck="false"
            placeholder="这一刻，有什么想记下的…&#10;&#10;支持 Markdown，也可以只发图片。"
          />
          <MomentImagesEditor
            v-model="content.images"
            :content-id="content.id"
            :disabled="busy"
            @uploading="uploading = $event"
            @uploaded="rememberUpload"
          />
        </template>
        <div v-else class="moment-composer-preview">
          <MarkdownBody v-if="content.body" :source="content.body" />
          <Gallery :images="content.images" compact />
          <p v-if="!content.body && !content.images.length" class="muted">
            写点什么，或者添加几张图片。
          </p>
        </div>
      </fieldset>
    </section>
    <p class="moment-editor-hint">
      {{
        content.status === "published"
          ? "保存后立即更新这条日常。"
          : "草稿仅自己可见。"
      }}
      <span class="moment-editor-shortcut"> · Ctrl / ⌘ + S 保存</span>
    </p>
  </div>
</template>

<style scoped>
.moment-editor-page {
  max-width: 980px;
  margin: 0 auto;
}
.moment-composer {
  max-width: 720px;
  margin: 35px auto 0;
  padding: 24px 28px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
}
.moment-composer-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  font-size: 12px;
}
.moment-composer-fields {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.moment-composer textarea {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
  min-height: 210px;
  font-size: 15px;
  line-height: 1.9;
  border-radius: 0;
}
.moment-composer textarea:focus-visible {
  outline: 1px solid var(--line);
  outline-offset: 5px;
}
.moment-composer :deep(.moment-images-editor) {
  margin-top: 25px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.moment-composer-preview {
  min-height: 280px;
}
.moment-editor-hint {
  max-width: 720px;
  margin: 14px auto;
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 760px) {
  .editor-heading {
    display: contents;
  }
  .editor-save-actions {
    position: sticky;
    top: 0;
    z-index: 2;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 0;
    background: var(--bg);
  }
  .editor-save-actions > .btn {
    flex: 1 1 auto;
    min-height: 44px;
  }
  .editor-save-actions > .text-link {
    min-height: 44px;
  }
  .moment-composer {
    margin-top: 8px;
    padding: 14px;
  }
  .moment-composer textarea {
    min-height: 150px;
    height: clamp(150px, 30svh, 220px);
    font-size: 16px;
  }
  .moment-composer-heading .text-link,
  .moment-composer :deep(.moment-image-actions > button) {
    min-height: 44px;
  }
  .moment-composer-preview {
    overflow-wrap: anywhere;
  }
  .moment-editor-shortcut {
    display: none;
  }
}
</style>
