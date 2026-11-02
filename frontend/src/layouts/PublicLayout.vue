<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { site, errorMessage } from "../lib/api";
import Icon from "../components/Icon.vue";
const route = useRoute(),
  menu = ref(false),
  dark = ref(false),
  error = ref("");
const navigation = ref<HTMLElement>();
const indicator = ref({
  transform: "translateX(0px)",
  width: "12px",
  opacity: 0,
});
const indicatorReady = ref(false);
const activeSection = computed(() => {
  if (route.path === "/") return "/";
  if (/^\/projects(?:\/|$)/.test(route.path)) return "/projects";
  if (/^\/articles(?:\/|$)/.test(route.path)) return "/articles";
  return "";
});
let navObserver: ResizeObserver | undefined;
let navFrame = 0;
function alignIndicator() {
  const link = navigation.value?.querySelector<HTMLElement>(
    `a[data-nav="${activeSection.value}"]`,
  );
  if (!link || !link.offsetWidth) {
    indicator.value = { ...indicator.value, opacity: 0 };
    return;
  }
  const width = Math.max(12, Math.min(28, link.offsetWidth * 0.4));
  indicator.value = {
    transform: `translateX(${link.offsetLeft + (link.offsetWidth - width) / 2}px)`,
    width: `${width}px`,
    opacity: 1,
  };
}
try {
  dark.value = localStorage.getItem("dev-notes-theme") === "dark";
} catch {
  /* 本地存储不可用时使用浅色 */
}
function applyTheme() {
  document.documentElement.dataset.theme = dark.value ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark.value ? "#211f1b" : "#fff4dd");
}
function toggleTheme() {
  dark.value = !dark.value;
  applyTheme();
  try {
    localStorage.setItem("dev-notes-theme", dark.value ? "dark" : "light");
  } catch {
    /* 可继续切换 */
  }
}
async function load() {
  error.value = "";
  try {
    await site.load();
  } catch (e) {
    error.value = errorMessage(e);
  }
}
applyTheme();
onMounted(load);
onMounted(async () => {
  await nextTick();
  alignIndicator();
  navFrame = requestAnimationFrame(() => {
    indicatorReady.value = true;
  });
  navObserver = new ResizeObserver(alignIndicator);
  if (navigation.value) navObserver.observe(navigation.value);
  document.fonts.ready.then(alignIndicator);
});
onBeforeUnmount(() => {
  navObserver?.disconnect();
  cancelAnimationFrame(navFrame);
});
watch(activeSection, () => nextTick(alignIndicator));
watch(
  () => route.fullPath,
  () => {
    menu.value = false;
  },
);
</script>
<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="public-shell">
    <header class="site-header wrap">
      <RouterLink to="/" class="brand"
        ><img
          :src="site.settings?.avatar_url || '/avatar.jpg'"
          alt=""
          width="44"
          height="44"
        /><span class="brand-name">{{
          site.settings?.name || "ThirteenAsh"
        }}</span
        ><span class="brand-dot">.</span></RouterLink
      >
      <nav ref="navigation" class="desktop-nav" aria-label="主导航">
        <RouterLink
          to="/"
          data-nav="/"
          :class="{ active: activeSection === '/' }"
          ><span class="nav-label">首页</span></RouterLink
        >
        <RouterLink
          to="/projects"
          data-nav="/projects"
          :class="{ active: activeSection === '/projects' }"
          ><span class="nav-label">作品</span></RouterLink
        >
        <RouterLink
          to="/articles"
          data-nav="/articles"
          :class="{ active: activeSection === '/articles' }"
          ><span class="nav-label">文章与日常</span></RouterLink
        >
        <span
          class="nav-indicator"
          :class="{ 'is-ready': indicatorReady }"
          :style="indicator"
          aria-hidden="true"
        />
      </nav>
      <div class="header-actions">
        <RouterLink to="/search" class="icon-btn" aria-label="搜索"
          ><Icon name="search" /></RouterLink
        ><button
          class="icon-btn theme-btn"
          :aria-label="dark ? '切换为浅色模式' : '切换为深色模式'"
          @click="toggleTheme"
        >
          <Icon :name="dark ? 'sun' : 'moon'" /></button
        ><button
          class="icon-btn mobile-menu"
          :aria-expanded="menu"
          aria-label="展开导航"
          @click="menu = !menu"
        >
          <Icon :name="menu ? 'close' : 'menu'" />
        </button>
      </div>
      <nav v-if="menu" class="mobile-nav" aria-label="手机导航">
        <RouterLink to="/">首页</RouterLink
        ><RouterLink to="/projects">作品集</RouterLink
        ><RouterLink to="/articles">文章与日常</RouterLink>
      </nav>
    </header>
    <main id="main-content" class="wrap public-main">
      <div v-if="error" class="error-panel" role="alert">
        {{ error }} <button class="text-link" @click="load">重新连接</button>
      </div>
      <RouterView v-slot="{ Component, route: pageRoute }"
        ><Transition name="page" mode="out-in"
          ><div :key="pageRoute.path" class="route-page">
            <component :is="Component" /></div></Transition
      ></RouterView>
    </main>
    <footer class="site-footer wrap">
      <div>
        <strong>{{ site.settings?.name || "ThirteenAsh" }}</strong
        ><span
          >© {{ new Date().getFullYear() }} · 用代码和文字，留住一些片刻。</span
        >
      </div>
      <div class="footer-links">
        <a
          v-if="site.settings?.github_url"
          :href="site.settings.github_url"
          target="_blank"
          rel="noopener noreferrer"
          >GitHub<Icon name="arrow" :size="14" /></a
        ><a href="#main-content">回到顶部 ↑</a>
      </div>
    </footer>
  </div>
</template>
