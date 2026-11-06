<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { api, ensureVisitor, site } from "../lib/api";
import { contentPath, formatDate, type Content } from "../lib/types";
import Gallery from "./Gallery.vue";
import Icon from "./Icon.vue";
import LikeButton from "./LikeButton.vue";
import MarkdownBody from "./MarkdownBody.vue";

const props = withDefaults(
  defineProps<{ content: Content; countView?: boolean }>(),
  { countView: true },
);
const card = ref<HTMLElement>();
const views = ref(props.content.view_count);
let observer: IntersectionObserver | undefined;
onMounted(() => {
  if (!props.countView || !card.value) return;
  observer = new IntersectionObserver(
    async (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer?.disconnect();
      try {
        await ensureVisitor();
        const stat = await api<{ view_count: number }>(
          `/contents/${props.content.id}/view`,
          { method: "POST" },
        );
        views.value = stat.view_count;
      } catch {
        /* 统计失败不影响阅读。 */
      }
    },
    { threshold: 0.1 },
  );
  observer.observe(card.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <article ref="card" class="moment-card">
    <img
      class="moment-avatar"
      :src="site.settings?.avatar_url || '/avatar.jpg'"
      alt=""
      width="42"
      height="42"
    />
    <div class="moment-main">
      <p class="moment-author">{{ site.settings?.name || "ThirteenAsh" }}</p>
      <MarkdownBody v-if="content.body" :source="content.body" />
      <Gallery :images="content.images" compact />
      <footer class="moment-footer">
        <RouterLink
          :to="contentPath(content)"
          class="moment-date"
          aria-label="查看这条日常"
        >
          <time :datetime="content.published_at || undefined">{{
            formatDate(content.published_at)
          }}</time>
        </RouterLink>
        <div class="content-stats">
          <span
            ><Icon name="eye" :size="15" />{{
              countView ? views : content.view_count
            }}</span
          >
          <LikeButton :content="content" />
        </div>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.moment-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 15px;
  padding: 28px 0;
  border-bottom: 1px solid var(--line);
  min-width: 0;
}
.moment-avatar {
  width: 42px;
  height: 42px;
  object-fit: cover;
  border-radius: 7px;
}
.moment-main {
  min-width: 0;
}
.moment-author {
  font-size: 14px;
  font-weight: 650;
  margin: 0 0 7px;
}
.moment-card :deep(.markdown) {
  font-size: 15px;
  line-height: 1.85;
}
.moment-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 17px;
  color: var(--muted);
  font-size: 12px;
}
.moment-date:hover {
  color: var(--ink);
}
@media (max-width: 480px) {
  .moment-card {
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 11px;
    padding: 24px 0;
  }
  .moment-avatar {
    width: 36px;
    height: 36px;
  }
  .content-stats {
    gap: 12px;
  }
}
</style>
