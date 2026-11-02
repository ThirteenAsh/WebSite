<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { api, ensureVisitor } from "../lib/api";
import type { Content } from "../lib/types";
import { contentPath, formatDate } from "../lib/types";
import Icon from "./Icon.vue";
import LikeButton from "./LikeButton.vue";
import MarkdownBody from "./MarkdownBody.vue";
import Gallery from "./Gallery.vue";
const props = defineProps<{ content: Content; index?: number }>();
const card = ref<HTMLElement>(),
  views = ref(props.content.view_count);
let observer: IntersectionObserver | undefined;
onMounted(() => {
  if (props.content.kind !== "moment" || !card.value) return;
  observer = new IntersectionObserver(
    async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer?.disconnect();
      try {
        await ensureVisitor();
        const stat = await api<{ view_count: number }>(
          `/contents/${props.content.id}/view`,
          { method: "POST" },
        );
        views.value = stat.view_count;
      } catch {
        /* 统计失败不影响阅读 */
      }
    },
    { threshold: 0.5 },
  );
  observer.observe(card.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <article v-if="content.kind === 'project'" class="project-card paper-card">
    <aside class="project-date">
      <strong>项目 {{ String(content.id).padStart(2, "0") }}</strong>
      <span>{{ content.repo_updated_at ? "仓库更新" : "发布于" }}</span>
      <time
        :datetime="content.repo_updated_at || content.published_at || undefined"
        >{{ formatDate(content.repo_updated_at || content.published_at) }}</time
      >
      <span class="project-category">{{
        content.label || content.repo_language || "独立项目"
      }}</span>
    </aside>
    <div class="project-main">
      <div class="project-card-top">
        <span
          class="badge"
          :class="{ orange: content.label !== 'AI 与实验' }"
          >{{ content.label || content.repo_language || "独立项目" }}</span
        ><span class="project-repo-name">{{
          content.repo_name || "PROJECT"
        }}</span>
      </div>
      <RouterLink :to="contentPath(content)" class="card-title"
        ><h3>{{ content.title }}</h3></RouterLink
      >
      <p class="project-description">
        {{
          content.summary || content.repo_description || "这个想法正在生长。"
        }}
      </p>
      <div class="project-card-bottom">
        <div class="tech-tags">
          <span v-for="tag in content.tech_stack" :key="tag">{{ tag }}</span>
        </div>
        <div class="project-card-actions">
          <a
            v-if="content.repo_url"
            :href="content.repo_url"
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
  <article
    v-else
    ref="card"
    class="writing-card paper-card"
    :class="{ 'moment-card': content.kind === 'moment' }"
  >
    <div class="writing-date">
      <time :datetime="content.published_at || undefined">{{
        formatDate(content.published_at)
      }}</time
      ><span class="type-dot" :class="{ orange: content.kind === 'article' }">{{
        content.kind === "moment" ? "日常片刻" : content.label || "文字记录"
      }}</span>
    </div>
    <div class="writing-main">
      <RouterLink
        v-if="content.title"
        :to="contentPath(content)"
        class="card-title"
        ><h3>{{ content.title }}</h3></RouterLink
      >
      <MarkdownBody v-if="content.kind === 'moment'" :source="content.body" />
      <p v-else class="writing-summary">
        {{ content.summary || "打开这篇文章，继续阅读。" }}
      </p>
      <RouterLink
        v-if="content.cover_url && content.kind !== 'moment'"
        :to="contentPath(content)"
        class="writing-cover"
        ><img :src="content.cover_url" :alt="content.title" loading="lazy"
      /></RouterLink>
      <Gallery :images="content.images" />
      <div class="writing-bottom">
        <div class="content-stats">
          <span><Icon name="eye" :size="16" />{{ views }}</span
          ><LikeButton :content="content" />
        </div>
        <RouterLink :to="contentPath(content)" class="text-link"
          >{{ content.kind === "moment" ? "查看记录" : "继续阅读"
          }}<Icon name="right" :size="16"
        /></RouterLink>
      </div>
    </div>
  </article>
</template>
