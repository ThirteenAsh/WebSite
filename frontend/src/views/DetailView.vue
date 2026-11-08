<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, ApiError, errorMessage, ensureVisitor, notify } from "../lib/api";
import {
  contentPath,
  formatDate,
  splitLineTags,
  type Content,
} from "../lib/types";
import Icon from "../components/Icon.vue";
import MarkdownBody from "../components/MarkdownBody.vue";
import Gallery from "../components/Gallery.vue";
import LikeButton from "../components/LikeButton.vue";
import RepoPanel from "../components/RepoPanel.vue";
import MomentCard from "../components/MomentCard.vue";
const route = useRoute(),
  router = useRouter(),
  content = ref<Content>(),
  loading = ref(true),
  error = ref(""),
  missing = ref(false);
const isProject = computed(() => content.value?.kind === "project");
const labels = computed(() => splitLineTags(content.value?.label));
let request = 0;
async function load() {
  const id = ++request;
  loading.value = true;
  error.value = "";
  missing.value = false;
  content.value = undefined;
  try {
    await ensureVisitor();
    const c = await api<Content>(`/contents/${route.params.id}`);
    if (id !== request) return;
    if (route.path !== contentPath(c)) {
      await router.replace(contentPath(c));
      return;
    }
    content.value = c;
    document.title = `${c.kind === "moment" ? "日常" : c.title} · ThirteenAsh`;
    try {
      const stat = await api<{ view_count: number }>(`/contents/${c.id}/view`, {
        method: "POST",
      });
      if (id === request && content.value)
        content.value.view_count = stat.view_count;
    } catch {
      /* 统计失败不影响阅读 */
    }
  } catch (e) {
    if (id === request) {
      error.value = errorMessage(e);
      missing.value = e instanceof ApiError && e.status === 404;
    }
  } finally {
    if (id === request) loading.value = false;
  }
}
watch(() => route.path, load, { immediate: true });
async function share() {
  try {
    await navigator.clipboard.writeText(location.href);
    notify("链接已复制");
  } catch {
    notify("请复制浏览器地址栏中的链接", "error");
  }
}
</script>
<template>
  <div v-if="loading" class="loading-panel" role="status">
    正在打开这篇记录…
  </div>
  <div v-else-if="error" class="empty-panel" role="alert">
    <h1>{{ missing ? "这篇记录暂时不在这里。" : "暂时无法打开" }}</h1>
    <p>{{ error }}</p>
    <RouterLink to="/" class="btn secondary">回到首页</RouterLink
    ><button v-if="!missing" class="btn secondary" @click="load">重试</button>
  </div>
  <section v-else-if="content?.kind === 'moment'" class="moment-detail">
    <RouterLink to="/moments" class="text-link"
      ><Icon name="back" :size="17" />全部日常</RouterLink
    >
    <MomentCard :content="content" :count-view="false" />
    <button class="text-link moment-share" @click="share">
      <Icon name="link" :size="16" />复制链接
    </button>
  </section>
  <article
    v-else-if="content"
    class="detail-page"
    :class="{ 'notebook-page': !isProject }"
  >
    <RouterLink
      :to="isProject ? '/projects' : '/articles'"
      class="text-link detail-back"
      ><Icon name="back" :size="17" />{{
        isProject ? "全部作品" : "全部记录"
      }}</RouterLink
    >
    <header class="detail-header">
      <p class="eyebrow">
        {{ isProject ? "PROJECT NOTES" : "WORDS & THOUGHTS" }}
      </p>
      <h1>{{ content.title }}</h1>
      <div class="detail-meta">
        <span
          v-for="(label, i) in labels.length
            ? labels
            : [isProject ? '独立项目' : '文章']"
          :key="label"
          class="badge content-tag"
          :class="`tag-tone-${i % 5}`"
          >{{ label }}</span
        > ThirteenAsh <time>{{ formatDate(content.published_at) }}</time
        ><span
          ><Icon name="eye" :size="16" />{{ content.view_count }} 次浏览</span
        >
      </div>
      <p v-if="content.summary" class="detail-summary">{{ content.summary }}</p>
    </header>
    <RepoPanel v-if="isProject" :content="content" />
    <img
      v-if="content.cover_url"
      class="detail-cover"
      :src="content.cover_url"
      :alt="content.title"
    />
    <div class="detail-body" :class="{ 'paper-card': isProject }">
      <MarkdownBody
        :source="content.body"
        :preview-images="content.kind === 'article'"
      />
      <p v-if="!content.body && !content.images.length" class="muted">
        更多内容，慢慢补上。
      </p>
      <Gallery :images="content.images" />
      <div v-if="content.tech_stack.length" class="tech-tags detail-tech">
        <span v-for="tag in content.tech_stack" :key="tag">{{ tag }}</span>
      </div>
      <div class="detail-end">
        <span>谢谢你读到这里。</span>
        <div>
          <LikeButton :content="content" /><button
            class="text-link"
            @click="share"
          >
            <Icon name="link" :size="16" />复制链接
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
<style scoped>
.moment-detail {
  max-width: 700px;
  margin: 25px auto 70px;
}
.moment-share {
  margin: 18px 0 0 57px;
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 480px) {
  .moment-share {
    margin-left: 47px;
  }
}
</style>
