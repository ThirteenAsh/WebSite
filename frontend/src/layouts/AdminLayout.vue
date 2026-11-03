<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { api, session, errorMessage } from "../lib/api";
import { showError } from "../lib/dialogs";
import Icon from "../components/Icon.vue";
const route = useRoute(),
  router = useRouter();
document.documentElement.dataset.theme = "light";
const nav = [
  { path: "/admin", label: "工作台", icon: "grid" },
  { path: "/admin/projects", label: "作品管理", icon: "code" },
  { path: "/admin/contents", label: "文章与日常", icon: "book" },
  { path: "/admin/github", label: "GitHub 导入与同步", icon: "github" },
  { path: "/admin/media", label: "图片库", icon: "image" },
  { path: "/admin/settings", label: "站点设置", icon: "settings" },
];
async function logout() {
  try {
    await api("/admin/logout", { method: "POST" });
    session.clear();
    router.push("/admin/login");
  } catch (e) {
    void showError(errorMessage(e), "退出登录未成功");
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
        <nav aria-label="当前位置" class="admin-breadcrumb">
          <span>个人空间</span><span class="muted" aria-hidden="true">/</span>
          <span aria-current="page">{{ route.meta.title }}</span>
        </nav>
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
