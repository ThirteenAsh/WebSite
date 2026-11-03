<script setup lang="ts">
import { computed } from "vue";
import { repoDisplay, formatDate, type Content } from "../lib/types";
import Icon from "./Icon.vue";
const props = defineProps<{ content: Content }>();
const repo = computed(() => repoDisplay(props.content));
</script>
<template>
  <div class="repo-panel paper-card">
    <div>
      <span class="eyebrow">GITHUB REPOSITORY</span>
      <h2>{{ repo.name || content.title }}</h2>
      <p v-if="repo.description">{{ repo.description }}</p>
      <div v-if="repo.language || repo.updated_at" class="repo-meta">
        <span v-if="repo.language"
          ><i class="status-dot" />{{ repo.language }}</span
        >
        <span v-if="repo.updated_at"
          >最近推送 {{ formatDate(repo.updated_at) }}</span
        >
      </div>
    </div>
    <div class="project-links">
      <a
        v-if="repo.url"
        :href="repo.url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn primary"
      >
        <Icon name="github" :size="16" />GitHub 仓库<Icon
          name="arrow"
          :size="15"
        />
      </a>
      <a
        v-if="content.demo_url"
        :href="content.demo_url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn secondary"
        >在线体验<Icon name="arrow" :size="15"
      /></a>
      <a
        v-if="content.docs_url"
        :href="content.docs_url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn secondary"
        >项目文档<Icon name="arrow" :size="15"
      /></a>
      <a
        v-if="content.release_url"
        :href="content.release_url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn secondary"
        >版本与下载<Icon name="arrow" :size="15"
      /></a>
    </div>
  </div>
</template>
