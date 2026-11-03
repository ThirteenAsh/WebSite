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
  type Content,
} from "../../lib/types";
import { markdownExcerpt } from "../../lib/markdown";
import Icon from "../../components/Icon.vue";
import MarkdownBody from "../../components/MarkdownBody.vue";
import ImageField from "../../components/ImageField.vue";
import MediaPicker from "../../components/MediaPicker.vue";
import Gallery from "../../components/Gallery.vue";
import PaperSelect from "../../components/PaperSelect.vue";
import RepoCardEditor from "../../components/RepoCardEditor.vue";
const route = useRoute(),
  router = useRouter(),
  content = ref<Content>(blankContent()),
  loading = ref(true),
  busy = ref(false),
  error = ref(""),
  baseline = ref(""),
  stack = ref("");
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
const listLabel = computed(() => (isProject.value ? "作品管理" : "文章与日常"));
async function load() {
  loading.value = true;
  error.value = "";
  try {
    content.value = route.params.id
      ? await api<Content>(`/admin/contents/${route.params.id}`)
      : blankContent(
          isProject.value
            ? "project"
            : route.query.kind === "moment"
              ? "moment"
              : "article",
        );
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
  c.tech_stack = stack.value
    .split(/[,，\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  c.status = status;
  if (c.kind !== "moment" && !c.title.trim()) {
    void showError("请先填写标题", "还差一个标题");
    return;
  }
  if (c.kind === "moment" && !c.body.trim() && !c.images.length) {
    void showError("短动态至少需要文字或配图", "补充一点内容吧");
    return;
  }
  if (!c.summary.trim() && c.kind !== "moment")
    c.summary = markdownExcerpt(c.body);
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
function insert(before: string, after = "") {
  const el = textarea.value,
    start = el?.selectionStart ?? content.value.body.length,
    end = el?.selectionEnd ?? start;
  content.value.body =
    content.value.body.slice(0, start) +
    before +
    content.value.body.slice(start, end) +
    after +
    content.value.body.slice(end);
  nextTick(() => {
    el?.focus();
    el?.setSelectionRange(start + before.length, end + before.length);
  });
}
function pick(target: "body" | "gallery") {
  imageTarget.value = target;
  picker.value?.open();
}
function selectedImage(url: string) {
  if (imageTarget.value === "body") insert(`\n![图片](${url})\n`);
  else if (content.value.images.length < 9) content.value.images.push(url);
  else void showError("最多添加 9 张配图", "配图数量已达上限");
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
    ><RouterLink :to="listPath">返回{{ listLabel }}</RouterLink>
  </div>
  <template v-else
    ><div class="editor-heading">
      <div>
        <RouterLink :to="listPath" class="text-link"
          ><Icon name="back" :size="16" />{{ listLabel }}</RouterLink
        >
        <h1>
          {{
            isProject
              ? content.id
                ? "编辑作品"
                : "添加一件新作品。"
              : content.id
                ? "朋友圈。"
                : "今天，有什么新鲜事吗？"
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
            <label v-if="!isProject"
              >内容形式<PaperSelect
                v-model="content.kind"
                label="内容形式"
                :disabled="!!content.id"
                :options="[
                  { value: 'article', label: '长文章 / 随笔' },
                  { value: 'moment', label: '短动态' },
                ]" /></label
            ><label
              >内容标记 <span class="optional">可选，不是分类</span
              ><input
                v-model="content.label"
                maxlength="40"
                :placeholder="
                  isProject
                    ? '例如：桌面工具、开源项目'
                    : '例如：技术笔记、生活随笔'
                "
            /></label>
          </div>
          <label
            >{{ content.kind === "moment" ? "标题（可选）" : "标题"
            }}<input
              v-model="content.title"
              class="title-input"
              maxlength="200"
              :placeholder="
                isProject ? '给作品起个名字…' : '给这篇记录起个名字…'
              " /></label
          ><label v-if="content.kind !== 'moment'"
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
        <section class="admin-panel markdown-editor">
          <div class="editor-toolbar">
            <div>
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
            </div>
            <span>MARKDOWN</span>
          </div>
          <div class="editor-split">
            <div class="editor-source">
              <div class="editor-pane-label">
                编辑 <span>{{ content.body.length }} 字符</span>
              </div>
              <textarea
                ref="textarea"
                v-model="content.body"
                aria-label="Markdown 正文"
                spellcheck="false"
                placeholder="从这里开始写…&#10;&#10;支持 Markdown、代码块、表格和图片。"
              />
            </div>
            <div class="editor-preview">
              <div class="editor-pane-label">实时预览 <span>PREVIEW</span></div>
              <div class="preview-body">
                <MarkdownBody v-if="content.body" :source="content.body" />
                <p v-else class="preview-placeholder">
                  你写下的文字，会在这里慢慢成形。
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
          <RouterLink v-else to="/admin/github" class="text-link"
            >从 GitHub 导入项目 →</RouterLink
          >
        </section>
      </aside>
    </div>
    <MediaPicker ref="picker" @select="selectedImage"
  /></template>
</template>
