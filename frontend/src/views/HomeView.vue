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
    const [p, w] = await Promise.all([
      api<Page<Content>>("/contents?kind=project&featured=1&limit=4"),
      api<Page<Content>>("/contents?kind=writing&limit=5&preview=1"),
    ]);
    projects.value = p.items;
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
  <section class="about-section" aria-labelledby="about-title">
    <div class="about-divider">
      <div class="about-avatar">
        <img
          :src="site.settings?.avatar_url || '/avatar.jpg'"
          :alt="`${site.settings?.name || 'ThirteenAsh'} 的头像`"
          width="96"
          height="96"
        />
      </div>
    </div>
    <div class="about-copy">
      <p class="eyebrow">A LITTLE ABOUT ME</p>
      <h2 id="about-title">
        你好，我是 {{ site.settings?.name || "ThirteenAsh"
        }}<span class="heading-dot">.</span>
      </h2>
      <p v-if="site.settings?.about" class="about-description">
        {{ site.settings.about }}
      </p>
      <div v-if="site.settings?.skills.length" class="about-skills">
        <span v-for="skill in site.settings.skills" :key="skill">{{
          skill
        }}</span>
      </div>
      <a
        v-if="site.settings?.github_url"
        :href="site.settings.github_url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-link about-link"
        ><Icon name="github" :size="17" />在 GitHub 看更多<Icon
          name="arrow"
          :size="15"
        />
      </a>
    </div>
  </section>
  <div v-if="error" class="error-panel" role="alert">
    {{ error }} <button class="text-link" @click="load">重试</button>
  </div>
  <section class="home-section" aria-labelledby="featured-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">01 / THINGS I BUILD</p>
        <h2 id="featured-title">
          我的一些项目<span class="heading-dot">.</span>
        </h2>
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
        <h2 id="writing-title">最近...<span class="heading-dot">.</span></h2>
        <p class="section-description">内容分享和日常，偶尔会更新的！</p>
      </div>
      <div class="home-writing-links">
        <RouterLink to="/articles" class="text-link"
          >全部文章<Icon name="right" :size="17"
        /></RouterLink>
        <RouterLink to="/moments" class="text-link"
          >全部日常<Icon name="right" :size="17"
        /></RouterLink>
      </div>
    </div>
    <div v-if="loading" class="loading-panel" role="status">正在整理文字…</div>
    <div v-else-if="writings.length" class="writing-list">
      <ContentCard
        v-for="c in writings"
        :key="c.id"
        :content="c"
        home-preview
      />
    </div>
    <div v-else class="empty-panel writing-empty">
      <span class="empty-doodle"><Icon name="edit" :size="31" /></span>
      <h3>这里似乎无人来过~</h3>
      <p>一些技术分享，一些日常片刻。<br />会写在这里。</p>
    </div>
  </section>
</template>
<style scoped>
.home-writing-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
}
</style>
