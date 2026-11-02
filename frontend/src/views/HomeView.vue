<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, site, errorMessage } from "../lib/api";
import type { Content, Page } from "../lib/types";
import Icon from "../components/Icon.vue";
import ContentCard from "../components/ContentCard.vue";
import HomeIntro from "../components/HomeIntro.vue";
const projects = ref<Content[]>([]),
  writings = ref<Content[]>([]),
  loading = ref(true),
  error = ref("");
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [p, all, w] = await Promise.all([
      api<Page<Content>>("/contents?kind=project&featured=1&limit=4"),
      api<Page<Content>>("/contents?kind=project&limit=4"),
      api<Page<Content>>("/contents?kind=writing&limit=5"),
    ]);
    // 首页展示四个作品，优先精选，再以其他已发布作品补齐。
    projects.value = [
      ...new Map([...p.items, ...all.items].map((c) => [c.id, c])).values(),
    ].slice(0, 4);
    writings.value = w.items;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function retryHome() {
  await Promise.allSettled([site.load(), load()]);
}
onMounted(load);
</script>
<template>
  <HomeIntro @retry="retryHome" />
  <div v-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button>
  </div>
  <section class="home-section" aria-labelledby="featured-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">01 / THINGS I BUILD</p>
        <h2 id="featured-title">精选作品<span class="heading-dot">.</span></h2>
      </div>
      <RouterLink to="/projects" class="text-link"
        >全部作品<Icon name="right" :size="17"
      /></RouterLink>
    </div>
    <div v-if="loading" class="loading-panel" role="status">
      正在翻开创作档案…
    </div>
    <div v-else-if="projects.length" class="project-grid home-project-grid">
      <ContentCard
        v-for="(c, i) in projects"
        :key="c.id"
        :content="c"
        :index="i"
      />
    </div>
    <div v-else class="empty-panel">
      <Icon name="code" :size="27" />
      <p>这里会放上值得分享的作品。</p>
      <RouterLink to="/projects" class="text-link">看看所有项目 →</RouterLink>
    </div>
  </section>
  <section class="home-section" aria-labelledby="writing-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">02 / NOTES ALONG THE WAY</p>
        <h2 id="writing-title">最近写下的<span class="heading-dot">.</span></h2>
        <p class="section-description">技术笔记，也有生活里的小事。</p>
      </div>
      <RouterLink to="/articles" class="text-link"
        >全部记录<Icon name="right" :size="17"
      /></RouterLink>
    </div>
    <div v-if="loading" class="loading-panel" role="status">正在整理文字…</div>
    <div v-else-if="writings.length" class="writing-list">
      <ContentCard v-for="c in writings" :key="c.id" :content="c" />
    </div>
    <div v-else class="empty-panel writing-empty">
      <span class="empty-doodle"><Icon name="edit" :size="31" /></span>
      <h3>下一篇，正在路上。</h3>
      <p>一些技术探索，一些日常片刻。<br />写下来的时候，就留在这里。</p>
    </div>
  </section>
  <section class="about-section">
    <p class="eyebrow">A LITTLE ABOUT ME</p>
    <div>
      <h2>你好，我是 {{ site.settings?.name || "ThirteenAsh" }}。</h2>
      <p>{{ site.settings?.about }}</p>
      <div class="tech-tags">
        <span v-for="skill in site.settings?.skills" :key="skill">{{
          skill
        }}</span>
      </div>
      <a
        :href="site.settings?.github_url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-link"
        >在 GitHub 看更多<Icon name="arrow" :size="16"
      /></a>
    </div>
  </section>
</template>
