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
import { blankContent, contentPath, type Content } from "../../lib/types";
import { markdownExcerpt } from "../../lib/markdown";
import Icon from "../../components/Icon.vue";
import MarkdownBody from "../../components/MarkdownBody.vue";
import ImageField from "../../components/ImageField.vue";
import MediaPicker from "../../components/MediaPicker.vue";
import Gallery from "../../components/Gallery.vue";
import PaperSelect from "../../components/PaperSelect.vue";
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
async function load() {
  loading.value = true;
  error.value = "";
  try {
    content.value = route.params.id
      ? await api<Content>(`/admin/contents/${route.params.id}`)
      : blankContent(
          route.query.kind === "moment"
            ? "moment"
            : route.query.kind === "project"
              ? "project"
              : "article",
        );
    stack.value = content.value.tech_stack.join(", ");
    baseline.value = serialized.value;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
watch(() => [route.params.id, route.query.kind], load, { immediate: true });
async function save(status: Content["status"]) {
  if (busy.value) return;
  const c = JSON.parse(JSON.stringify(content.value)) as Content;
  c.tech_stack = stack.value
    .split(/[,，\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  c.status = status;
  if (c.kind !== "moment" && !c.title.trim()) {
    notify("请先填写标题", "error");
    return;
  }
  if (c.kind === "moment" && !c.body.trim() && !c.images.length) {
    notify("短动态至少需要文字或配图", "error");
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
    notify(status === "published" ? "内容已发布" : "已保存到草稿箱");
    if (isNew) await router.replace(`/admin/contents/${saved.id}`);
  } catch (e) {
    notify(errorMessage(e), "error");
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
  else notify("最多添加 9 张配图", "error");
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
onBeforeRouteLeave(
  () => !dirty.value || confirm("还有未保存的修改，确定离开吗？"),
);
onBeforeRouteUpdate((to, from) => {
  if (to.params.id === from.params.id && to.query.kind === from.query.kind)
    return true;
  return !dirty.value || confirm("还有未保存的修改，确定离开吗？");
});
</script>
<template>
  <div v-if="loading" class="loading-panel">正在打开编辑器…</div>
  <div v-else-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button
    ><RouterLink to="/admin/contents">返回内容管理</RouterLink>
  </div>
  <template v-else
    ><div class="editor-heading">
      <div>
        <RouterLink to="/admin/contents" class="text-link"
          ><Icon name="back" :size="16" />内容管理</RouterLink
        >
        <h1>{{ content.id ? "继续写下去。" : "今天，写点什么？" }}</h1>
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
              >内容形式<PaperSelect
                v-model="content.kind"
                label="内容形式"
                :disabled="!!content.id"
                :options="[
                  { value: 'article', label: '长文章 / 随笔' },
                  { value: 'moment', label: '短动态' },
                  { value: 'project', label: '项目介绍' },
                ]" /></label
            ><label
              >内容标记 <span class="optional">可选，不是分类</span
              ><input
                v-model="content.label"
                maxlength="40"
                placeholder="例如：技术笔记、生活随笔"
            /></label>
          </div>
          <label
            >{{ content.kind === "moment" ? "标题（可选）" : "标题"
            }}<input
              v-model="content.title"
              class="title-input"
              maxlength="200"
              placeholder="给这篇记录起个名字…" /></label
          ><label v-if="content.kind !== 'moment'"
            >摘要 <span class="optional">留空时从正文提取</span
            ><textarea
              v-model="content.summary"
              rows="2"
              maxlength="2000"
              placeholder="用几句话，介绍这篇内容。"
            />
          </label>
        </section>
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
            ><input v-model="stack" placeholder="Vue, Go, MySQL" /></label
          ><label
            >在线体验<input
              v-model="content.demo_url"
              type="url"
              placeholder="https://" /></label
          ><label
            >项目文档<input
              v-model="content.docs_url"
              type="url"
              placeholder="https://" /></label
          ><label
            >版本与下载<input
              v-model="content.release_url"
              type="url"
              placeholder="https://"
          /></label>
          <div v-if="content.repo_full_name" class="repo-source">
            <strong>已关联 GitHub</strong
            ><span>{{ content.repo_full_name }}</span>
            <p>
              同步只更新仓库名称、描述、主要语言和最近推送时间，不覆盖这里的展示文案。
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
