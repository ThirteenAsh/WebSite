<script setup lang="ts">
import { computed } from "vue";
import {
  repoDisplay,
  formatDate,
  type Content,
  type RepoOverrides,
} from "../lib/types";
import RepoPanel from "./RepoPanel.vue";
const content = defineModel<Content>({ required: true });
const repo = computed(() => repoDisplay(content.value));
const resetLabel = computed(() =>
  content.value.repo_full_name ? "恢复 GitHub 信息" : "恢复默认",
);
const fields: {
  key: keyof RepoOverrides;
  label: string;
  type: string;
  limit?: number;
}[] = [
  { key: "name", label: "仓库显示名称", type: "text", limit: 255 },
  { key: "description", label: "仓库卡片描述", type: "textarea", limit: 2000 },
  { key: "language", label: "主要语言", type: "textarea", limit: 4200 },
  { key: "updated_at", label: "最近推送日期", type: "date" },
  { key: "url", label: "仓库按钮链接", type: "url", limit: 1000 },
];
function value(key: keyof RepoOverrides) {
  const current = repo.value[key];
  return key === "updated_at" && current
    ? formatDate(current).replaceAll(".", "-")
    : current || "";
}
function update(key: keyof RepoOverrides, event: Event) {
  let next = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  if (key === "updated_at" && next) next += "T00:00:00+08:00";
  content.value.repo_overrides = {
    ...content.value.repo_overrides,
    [key]: next,
  };
}
function reset(key: keyof RepoOverrides) {
  const next = { ...content.value.repo_overrides };
  delete next[key];
  content.value.repo_overrides = next;
}
</script>
<template>
  <section class="admin-panel repo-card-editor">
    <div class="panel-heading">
      <h2>仓库信息卡</h2>
      <span class="muted small-text">展示在作品详情中</span>
    </div>
    <p class="muted small-text">
      未修改的字段跟随 GitHub
      更新；自定义后会保留你的填写内容。清空描述、语言、日期或链接可隐藏对应内容，名称留空时使用作品标题。
    </p>
    <div v-if="content.repo_full_name" class="repo-source">
      <strong>同步来源</strong><span>{{ content.repo_full_name }}</span>
    </div>
    <div class="repo-card-fields">
      <div
        v-for="field in fields"
        :key="field.key"
        class="repo-card-field"
        :class="{
          'wide-field': field.type === 'textarea' || field.key === 'url',
        }"
      >
        <div class="repo-field-heading">
          <label :for="`repo-card-${field.key}`">{{ field.label }}</label>
          <button
            v-if="content.repo_overrides?.[field.key] != null"
            type="button"
            class="text-link"
            :aria-label="`${field.label}：${resetLabel}`"
            @click="reset(field.key)"
          >
            {{ resetLabel }}
          </button>
          <span v-else class="muted small-text">{{
            content.repo_full_name ? "跟随 GitHub" : "尚未自定义"
          }}</span>
        </div>
        <textarea
          v-if="field.type === 'textarea'"
          :id="`repo-card-${field.key}`"
          :value="value(field.key)"
          :maxlength="field.limit"
          :placeholder="
            field.key === 'language'
              ? '每行一项，例如：\nVue\nTypeScript'
              : undefined
          "
          :aria-describedby="
            field.key === 'language' ? 'repo-language-help' : undefined
          "
          rows="3"
          @input="update(field.key, $event)"
        />
        <input
          v-else
          :id="`repo-card-${field.key}`"
          :type="field.type"
          :value="value(field.key)"
          :maxlength="field.limit"
          @input="update(field.key, $event)"
        />
        <p
          v-if="field.key === 'language'"
          id="repo-language-help"
          class="muted small-text"
        >
          每行一项，最多 20 项。
        </p>
      </div>
      <label
        >在线体验链接<input
          v-model="content.demo_url"
          type="url"
          maxlength="1000"
          placeholder="https://"
      /></label>
      <label
        >项目文档链接<input
          v-model="content.docs_url"
          type="url"
          maxlength="1000"
          placeholder="https://"
      /></label>
      <label class="wide-field"
        >版本与下载链接<input
          v-model="content.release_url"
          type="url"
          maxlength="1000"
          placeholder="https://"
      /></label>
    </div>
    <p class="field-label">卡片预览</p>
    <RepoPanel :content="content" />
  </section>
</template>
