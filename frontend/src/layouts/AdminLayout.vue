<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { api, session, notify, errorMessage } from "../lib/api";
import Icon from "../components/Icon.vue";
const route = useRoute(),
  router = useRouter();
document.documentElement.dataset.theme = "light";
const nav = [
  { path: "/admin", label: "工作台", icon: "grid" },
  { path: "/admin/contents", label: "内容管理", icon: "book" },
  { path: "/admin/github", label: "GitHub 项目", icon: "code" },
  { path: "/admin/media", label: "图片库", icon: "image" },
  { path: "/admin/settings", label: "站点设置", icon: "settings" },
];
async function logout() {
  try {
    await api("/admin/logout", { method: "POST" });
    session.clear();
    router.push("/admin/login");
  } catch (e) {
    notify(errorMessage(e), "error");
  }
}
</script>
<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <RouterLink to="/admin" class="admin-brand"
        ><span class="admin-logo"><Icon name="code" :size="23" /></span>
        <div>ThirteenAsh<small>我的创作后台</small></div></RouterLink
      >
      <p class="sidebar-caption">WORKSPACE</p>
      <nav aria-label="后台导航">
        <RouterLink
          v-for="item in nav"
          :key="item.path"
          :to="item.path"
          :class="{
            selected:
              item.path === '/admin'
                ? route.path === '/admin'
                : route.path.startsWith(item.path),
          }"
          ><Icon :name="item.icon" />{{ item.label
          }}<span v-if="item.path === '/admin/contents'" class="nav-shortcut"
            >✎</span
          ></RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <RouterLink to="/" target="_blank"
          ><Icon name="arrow" :size="17" />打开个人空间</RouterLink
        ><button @click="logout">
          <Icon name="logout" :size="17" />退出登录</button
        ><span class="sidebar-user"
          ><i class="status-dot" />{{ session.username }}</span
        >
      </div>
    </aside>
    <div class="admin-workspace">
      <header class="admin-topbar">
        <span>个人空间 <span class="muted">/</span> {{ route.meta.title }}</span
        ><RouterLink to="/admin/contents/new" class="btn primary small"
          ><Icon name="plus" :size="16" />写点什么</RouterLink
        >
      </header>
      <main class="admin-main">
        <RouterView v-slot="{ Component, route: pageRoute }"
          ><Transition name="page" mode="out-in"
            ><div :key="pageRoute.path" class="route-page">
              <component :is="Component" /></div></Transition
        ></RouterView>
      </main>
    </div>
  </div>
</template>
