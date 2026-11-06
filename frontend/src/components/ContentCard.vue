<script setup lang="ts">
import { computed } from "vue";
import type { Content } from "../lib/types";
import {
  contentPath,
  formatDate,
  repoDisplay,
  splitLineTags,
} from "../lib/types";
import { markdownExcerpt } from "../lib/markdown";
import Icon from "./Icon.vue";
import LikeButton from "./LikeButton.vue";
import Gallery from "./Gallery.vue";
import MomentCard from "./MomentCard.vue";
const props = defineProps<{
  content: Content;
  index?: number;
  homePreview?: boolean;
}>();
const repo = computed(() => repoDisplay(props.content));
const labels = computed(() => splitLineTags(props.content.label));
const projectLabels = computed(() => {
  if (labels.value.length) return labels.value;
  const languages = splitLineTags(repo.value.language);
  return languages.length ? languages : ["独立项目"];
});
const bodyPreview = computed(
  () =>
    markdownExcerpt(props.content.body_preview || "", 600) ||
    props.content.summary ||
    "打开这篇文章，继续阅读。",
);
</script>
<template>
  <article v-if="content.kind === 'project'" class="project-card paper-card">
    <aside class="project-date">
      <strong>项目 {{ String(content.id).padStart(2, "0") }}</strong>
      <span>{{ repo.updated_at ? "仓库更新" : "发布于" }}</span>
      <time :datetime="repo.updated_at || content.published_at || undefined">{{
        formatDate(repo.updated_at || content.published_at)
      }}</time>
      <span class="project-category">{{ projectLabels.join(" · ") }}</span>
    </aside>
    <div class="project-main">
      <div class="project-card-top">
        <span
          v-for="(label, i) in projectLabels"
          :key="label"
          class="badge content-tag"
          :class="`tag-tone-${i % 5}`"
          >{{ label }}</span
        ><span class="project-repo-name">{{
          repo.name || content.title || "PROJECT"
        }}</span>
      </div>
      <RouterLink :to="contentPath(content)" class="card-title"
        ><h3>{{ content.title }}</h3></RouterLink
      >
      <p class="project-description">
        {{ content.summary || repo.description || "这个想法正在生长。" }}
      </p>
      <div class="project-card-bottom">
        <div class="tech-tags">
          <span v-for="tag in content.tech_stack" :key="tag">{{ tag }}</span>
        </div>
        <div class="project-card-actions">
          <a
            v-if="repo.url"
            :href="repo.url"
            target="_blank"
            rel="noopener noreferrer"
            class="project-pill repository-link"
            >GitHub 仓库</a
          >
          <RouterLink :to="contentPath(content)" class="project-pill"
            >项目详情</RouterLink
          >
        </div>
      </div>
      <div
        v-if="content.release_url || content.docs_url || content.demo_url"
        class="project-extra-links"
      >
        <a
          v-if="content.release_url"
          :href="content.release_url"
          target="_blank"
          rel="noopener noreferrer"
          class="project-pill"
          >版本与下载</a
        >
        <a
          v-if="content.docs_url"
          :href="content.docs_url"
          target="_blank"
          rel="noopener noreferrer"
          class="project-pill"
          >项目文档</a
        >
        <a
          v-if="content.demo_url"
          :href="content.demo_url"
          target="_blank"
          rel="noopener noreferrer"
          class="project-pill"
          >在线体验</a
        >
      </div>
    </div>
  </article>
  <MomentCard v-else-if="content.kind === 'moment'" :content="content" />
  <article v-else class="writing-card paper-card">
    <div class="writing-date">
      <time :datetime="content.published_at || undefined">{{
        formatDate(content.published_at)
      }}</time
      ><span
        v-for="(label, i) in labels.length ? labels : ['内容分享']"
        :key="label"
        class="type-dot content-tag"
        :class="`tag-tone-${i % 5}`"
        >{{ label }}</span
      >
    </div>
    <div class="writing-main">
      <RouterLink
        v-if="content.title"
        :to="contentPath(content)"
        class="card-title"
        ><h3>{{ content.title }}</h3></RouterLink
      >
      <p
        class="writing-summary"
        :class="{ 'writing-body-preview': homePreview }"
      >
        {{
          homePreview
            ? bodyPreview
            : content.summary || "打开这篇文章，继续阅读。"
        }}
      </p>
      <RouterLink
        v-if="content.cover_url"
        :to="contentPath(content)"
        class="writing-cover"
        ><img :src="content.cover_url" :alt="content.title" loading="lazy"
      /></RouterLink>
      <Gallery :images="content.images" />
      <div class="writing-bottom">
        <div class="content-stats">
          <span><Icon name="eye" :size="16" />{{ content.view_count }}</span
          ><LikeButton :content="content" />
        </div>
        <RouterLink :to="contentPath(content)" class="text-link"
          >继续阅读<Icon name="right" :size="16"
        /></RouterLink>
      </div>
    </div>
  </article>
</template>
