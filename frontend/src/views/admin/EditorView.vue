<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from "vue-router";
import { api, notify, errorMessage } from "../../lib/api";
import { confirmAction, showError } from "../../lib/dialogs";
import {
  blankContent,
  contentPath,
  adminContentPath,
  splitLineTags,
  type Content,
} from "../../lib/types";
import { markdownExcerpt } from "../../lib/markdown";
import Icon from "../../components/Icon.vue";
import AdminBackLink from "../../components/AdminBackLink.vue";
import MarkdownBody from "../../components/MarkdownBody.vue";
import ImageField from "../../components/ImageField.vue";
import MediaPicker from "../../components/MediaPicker.vue";
import Gallery from "../../components/Gallery.vue";
import RepoCardEditor from "../../components/RepoCardEditor.vue";
const route = useRoute(),
  router = useRouter(),
  content = ref<Content>(blankContent()),
  loading = ref(true),
  busy = ref(false),
  error = ref(""),
  baseline = ref(""),
  stack = ref("");
const preview = ref(false);
const textarea = ref<HTMLTextAreaElement>(),
  picker = ref<InstanceType<typeof MediaPicker>>(),
  imageTarget = ref<"body" | "gallery">("body");
const serialized = computed(() =>
  JSON.stringify({ content: content.value, stack: stack.value }),
);
const dirty = computed(
  () =>
    !loading.value &&
    baseline.value !== "" &&
    serialized.value !== baseline.value,
);
const isProject = computed(() => route.meta.section === "projects");
const listPath = computed(() =>
  isProject.value ? "/admin/projects" : "/admin/contents",
);
const listLabel = computed(() => (isProject.value ? "作品管理" : "文章管理"));
function navigateEditorTab(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = (event.currentTarget as HTMLElement).parentElement;
  preview.value =
    event.key === "Home" ? false : event.key === "End" ? true : !preview.value;
  nextTick(() =>
    tabs?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus(),
  );
}
async function load() {
  loading.value = true;
  error.value = "";
  preview.value = false;
  try {
    content.value = route.params.id
      ? await api<Content>(`/admin/contents/${route.params.id}`)
      : blankContent(isProject.value ? "project" : "article");
    if (route.params.id && route.path !== adminContentPath(content.value)) {
      baseline.value = "";
      await router.replace(adminContentPath(content.value));
      return;
    }
    content.value.repo_overrides ||= {};
    stack.value = content.value.tech_stack.join(", ");
    baseline.value = serialized.value;
  } catch (e) {
    error.value = errorMessage(e);
    void showError(error.value, "编辑器打开失败");
  } finally {
    loading.value = false;
  }
}
watch(() => [route.params.id, route.query.kind, route.meta.section], load, {
  immediate: true,
});
async function save(status: Content["status"]) {
  if (busy.value) return;
  const c = JSON.parse(JSON.stringify(content.value)) as Content;
  c.label = splitLineTags(c.label).join("\n");
  if (c.repo_overrides.language != null) {
    c.repo_overrides.language = splitLineTags(c.repo_overrides.language).join(
      "\n",
    );
  }
  c.tech_stack = stack.value
    .split(/[,，\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  c.status = status;
  if (!c.title.trim()) {
    void showError("请先填写标题", "还差一个标题");
    return;
  }
  if (!c.summary.trim()) c.summary = markdownExcerpt(c.body);
  busy.value = true;
  try {
    const isNew = !c.id;
    const saved = await api<{ id: number }>(
      isNew ? "/admin/contents" : `/admin/contents/${c.id}`,
      { method: isNew ? "POST" : "PUT", body: JSON.stringify(c) },
    );
    content.value = { ...c, id: saved.id };
    baseline.value = serialized.value;
    notify(
      status === "published"
        ? isProject.value
          ? "作品已发布"
          : "内容已发布"
        : "已保存到草稿箱",
    );
    if (isNew) await router.replace(adminContentPath(content.value));
  } catch (e) {
    void showError(errorMessage(e), "内容未保存");
  } finally {
    busy.value = false;
  }
}
function bodyPosition() {
  const el = textarea.value;
  if (!el) return;
  return {
    el,
    start: el.selectionStart,
    end: el.selectionEnd,
    direction: el.selectionDirection,
    scrollTop: el.scrollTop,
    scrollLeft: el.scrollLeft,
  };
}
let imagePosition: ReturnType<typeof bodyPosition>;
function insert(before: string, after = "", position = bodyPosition()) {
  if (!position || position.el !== textarea.value) return;
  const { el, start, end, direction, scrollTop, scrollLeft } = position;
  const body = el.value;
  content.value.body =
    body.slice(0, start) +
    before +
    body.slice(start, end) +
    after +
    body.slice(end);
  nextTick(() => {
    if (el !== textarea.value) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(start + before.length, end + before.length, direction);
    el.scrollTop = scrollTop;
    el.scrollLeft = scrollLeft;
  });
}
function pick(target: "body" | "gallery") {
  imageTarget.value = target;
  imagePosition = target === "body" ? bodyPosition() : undefined;
  picker.value?.open();
}
function selectedImage(url: string) {
  if (imageTarget.value === "body") {
    if (imagePosition) insert(`\n![图片](${url})\n`, "", imagePosition);
    imagePosition = undefined;
  } else if (content.value.images.length < 9) content.value.images.push(url);
  else void showError("最多添加 9 张配图", "配图数量已达上限");
}
function resetArticleBodyHeight() {
  if (!isProject.value && CSS.supports("field-sizing", "content")) {
    textarea.value?.style.removeProperty("height");
  }
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
function keyboard(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (document.querySelector("dialog[open]")) return;
    if (!loading.value && !error.value) save(content.value.status);
  }
}
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("keydown", keyboard);
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("keydown", keyboard);
});
function confirmLeave() {
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
onBeforeRouteUpdate((to, from) => {
  if (
    to.params.id === from.params.id &&
    to.query.kind === from.query.kind &&
    to.meta.section === from.meta.section
  )
    return true;
  return confirmLeave();
});
</script>
<template>
  <div v-if="loading" class="loading-panel">正在打开编辑器…</div>
  <div v-else-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button
    ><AdminBackLink :to="listPath" :label="listLabel" />
  </div>
  <template v-else
    ><div class="editor-heading">
      <div>
        <AdminBackLink :to="listPath" :label="listLabel" />
        <h1>
          {{
            isProject
              ? content.id
                ? "编辑作品"
                : "添加一件新作品。"
              : content.id
                ? "编辑文章"
                : "写一篇新文章。"
          }}
        </h1>
        <span class="muted small-text"
          >{{
            dirty
              ? "有未保存的修改"
              : content.id
                ? "修改已保存"
                : "新内容尚未保存"
          }}
          · Ctrl / ⌘ + S 保存</span
        >
      </div>
      <div class="editor-save-actions">
        <RouterLink
          v-if="content.id && content.status === 'published'"
          :to="contentPath(content)"
          target="_blank"
          class="btn secondary"
          >查看页面<Icon name="arrow" :size="16" /></RouterLink
        ><button class="btn secondary" :disabled="busy" @click="save('draft')">
          {{
            content.status === "published" ? "撤回为草稿" : "保存草稿"
          }}</button
        ><button
          class="btn primary"
          :disabled="busy"
          @click="save('published')"
        >
          <Icon name="check" :size="17" />{{
            busy
              ? "正在保存…"
              : content.status === "published"
                ? "保存并更新"
                : isProject
                  ? "发布作品"
                  : "发布内容"
          }}
        </button>
      </div>
    </div>
    <div class="editor-layout">
      <div class="editor-content">
        <section class="admin-panel editor-basics">
          <div class="form-row">
            <label
              >内容标记 <textarea
                v-model="content.label"
                rows="3"
                maxlength="2000"
                :placeholder="
                  isProject ? '桌面工具\n开源项目' : 'Linux\n操作系统'
                "
              />
            </label>
          </div>
          <label
            >标题<input
              v-model="content.title"
              class="title-input"
              maxlength="200"
              :placeholder="
                isProject ? '给作品起个名字…' : '给这篇记录起个名字…'
              " /></label
          ><label
            >摘要 <span class="optional">留空时从正文提取</span
            ><textarea
              v-model="content.summary"
              rows="2"
              maxlength="2000"
              :placeholder="
                isProject
                  ? '用几句话，介绍这个作品。'
                  : '用几句话，介绍这篇内容。'
              "
            />
          </label>
        </section>
        <RepoCardEditor v-if="isProject" v-model="content" />
        <section
          class="admin-panel markdown-editor"
          :class="{ 'markdown-editor--article': !isProject }"
        >
          <div class="editor-toolbar">
            <div
              v-if="!isProject"
              class="editor-write-tabs"
              role="tablist"
              aria-label="正文编辑模式"
            >
              <button
                id="markdown-write-tab"
                type="button"
                role="tab"
                :aria-selected="!preview"
                aria-controls="markdown-write-panel"
                :tabindex="preview ? -1 : 0"
                @click="preview = false"
                @keydown="navigateEditorTab"
              >
                编写
              </button>
              <button
                id="markdown-preview-tab"
                type="button"
                role="tab"
                :aria-selected="preview"
                aria-controls="markdown-preview-panel"
                :tabindex="preview ? 0 : -1"
                @click="preview = true"
                @keydown="navigateEditorTab"
              >
                预览
              </button>
            </div>
            <fieldset
              v-show="isProject || !preview"
              class="editor-format-actions"
              aria-label="Markdown 格式工具"
              :disabled="!isProject && preview"
            >
              <button
                title="二级标题"
                aria-label="插入标题"
                @click="insert('## ')"
              >
                H₂</button
              ><button
                title="加粗"
                aria-label="插入加粗"
                @click="insert('**', '**')"
              >
                <strong>B</strong></button
              ><button
                title="斜体"
                aria-label="插入斜体"
                @click="insert('*', '*')"
              >
                <em>I</em></button
              ><button
                title="列表"
                aria-label="插入列表"
                @click="insert('\n- ')"
              >
                ≡</button
              ><button
                title="代码块"
                aria-label="插入代码块"
                @click="insert('\n```\n', '\n```\n')"
              >
                <Icon name="code" :size="18" /></button
              ><button
                title="插入链接"
                aria-label="插入链接"
                @click="insert('[', '](https://)')"
              >
                <Icon name="link" :size="17" /></button
              ><button
                title="插入图片"
                aria-label="插入图片"
                @click="pick('body')"
              >
                <Icon name="image" :size="18" />
              </button>
            </fieldset>
            <span v-if="isProject">MARKDOWN</span>
          </div>
          <div
            id="markdown-editor-content"
            class="editor-split"
            :class="{ 'editor-single': !isProject }"
          >
            <div
              v-show="isProject || !preview"
              class="editor-source"
              :id="!isProject ? 'markdown-write-panel' : undefined"
              :role="!isProject ? 'tabpanel' : undefined"
              :aria-labelledby="!isProject ? 'markdown-write-tab' : undefined"
            >
              <div v-if="isProject" class="editor-pane-label">
                编辑 <span>{{ content.body.length }} 字符</span>
              </div>
              <textarea
                ref="textarea"
                v-model="content.body"
                aria-label="Markdown 正文"
                spellcheck="false"
                placeholder="从这里开始写…&#10;&#10;支持 Markdown、代码块、表格和图片。"
                @paste="resetArticleBodyHeight"
              />
            </div>
            <div
              v-show="isProject || preview"
              class="editor-preview"
              :id="!isProject ? 'markdown-preview-panel' : undefined"
              :role="!isProject ? 'tabpanel' : undefined"
              :aria-labelledby="!isProject ? 'markdown-preview-tab' : undefined"
              :tabindex="!isProject ? 0 : undefined"
            >
              <div v-if="isProject" class="editor-pane-label">
                实时预览 <span>PREVIEW</span>
              </div>
              <div class="preview-body">
                <MarkdownBody v-if="content.body" :source="content.body" />
                <p
                  v-else-if="!content.images.length"
                  class="preview-placeholder"
                >
                  {{
                    isProject
                      ? "你写下的文字，会在这里慢慢成形。"
                      : "暂无可预览的内容。"
                  }}
                </p>
                <Gallery :images="content.images" />
              </div>
            </div>
          </div>
        </section>
      </div>
      <aside class="editor-aside">
        <section class="admin-panel">
          <div class="panel-heading">
            <h2>发布设置</h2>
            <span class="status-badge" :class="content.status">{{
              content.status === "published" ? "已发布" : "草稿"
            }}</span>
          </div>
          <p class="muted small-text">
            {{
              content.status === "published"
                ? "内容已经公开，保存后立即更新。"
                : "草稿仅在后台可见，发布后才会出现在个人空间。"
            }}
          </p>
          <ImageField v-model="content.cover_url" label="封面" />
        </section>
        <section class="admin-panel">
          <div class="panel-heading">
            <h2>正文配图</h2>
            <span class="muted small-text"
              >{{ content.images.length }} / 9</span
            >
          </div>
          <div class="editor-gallery">
            <div v-for="(src, i) in content.images" :key="i">
              <img :src="src" alt="配图" /><button
                class="icon-btn"
                :aria-label="`移除第 ${i + 1} 张配图`"
                @click="content.images.splice(i, 1)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
          </div>
          <button
            class="btn secondary full-width"
            :disabled="content.images.length >= 9"
            @click="pick('gallery')"
          >
            <Icon name="plus" :size="16" />添加配图
          </button>
        </section>
        <section
          v-if="content.kind === 'project'"
          class="admin-panel project-editor-settings"
        >
          <h2>作品展示</h2>
          <label class="checkbox-label"
            ><input
              v-model="content.featured"
              type="checkbox"
            />设为首页精选</label
          ><label
            >展示顺序 <span class="optional">数字小的在前</span
            ><input
              v-model.number="content.sort_order"
              type="number"
              min="-100000"
              max="100000" /></label
          ><label
            >技术栈 <span class="optional">用逗号分隔</span
            ><input v-model="stack" placeholder="Vue, Go, MySQL"
          /></label>
          <div v-if="content.repo_full_name" class="repo-source">
            <strong>已关联 GitHub</strong
            ><span>{{ content.repo_full_name }}</span>
            <p>
              每日同步更新原始仓库信息，保留自定义的卡片内容、作品介绍及精选设置。
            </p>
          </div>
          <RouterLink v-else to="/admin/projects?view=github" class="text-link"
            >从 GitHub 导入项目 →</RouterLink
          >
        </section>
      </aside>
    </div>
    <MediaPicker ref="picker" @select="selectedImage"
  /></template>
</template>
