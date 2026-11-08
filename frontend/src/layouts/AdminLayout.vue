<script setup lang="ts">
import { nextTick, onMounted, watch } from "vue";
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
  { path: "/admin/contents", label: "文章管理", icon: "book" },
  { path: "/admin/moments", label: "日常管理", icon: "image" },
  { path: "/admin/media", label: "图片库", icon: "image" },
  { path: "/admin/settings", label: "站点设置", icon: "settings" },
];
async function revealSelectedNav() {
  await nextTick();
  const selected = document.querySelector<HTMLElement>(
    ".admin-shell--moments .admin-sidebar nav a.selected",
  );
  if (selected && window.innerWidth <= 900) {
    const navigation = selected.parentElement!;
    navigation.scrollLeft =
      selected.offsetLeft -
      navigation.offsetLeft -
      (navigation.clientWidth - selected.offsetWidth) / 2;
  }
}
onMounted(revealSelectedNav);
watch(() => route.path, revealSelectedNav);
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
  <div
    class="admin-shell"
    :class="{
      'admin-shell--moments': route.meta.section === 'moments',
      'admin-shell--moment-editor': route.meta.momentEditor,
    }"
  >
    <aside class="admin-sidebar">
      <RouterLink to="/admin" class="admin-brand"
        ><span class="admin-logo"><Icon name="code" :size="23" /></span>
        <div>ThirteenAsh<small>创作后台</small></div></RouterLink
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
          ><Icon :name="item.icon" />{{ item.label }}</RouterLink
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
      <main class="admin-main">
        <RouterView v-slot="{ Component, route: pageRoute }"
          ><Transition name="admin-page" mode="out-in"
            ><div :key="pageRoute.path" class="route-page">
              <component :is="Component" /></div></Transition
        ></RouterView>
      </main>
    </div>
  </div>
</template>
<style scoped>
@media (max-width: 900px) {
  .admin-shell--moments {
    min-width: 0;
    display: block;
  }
  .admin-shell--moments .admin-sidebar {
    position: static;
    width: 100%;
    padding: 16px 20px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
    gap: 16px;
  }
  .admin-shell--moments .sidebar-caption,
  .admin-shell--moments .sidebar-bottom {
    display: none;
  }
  .admin-shell--moments .admin-sidebar nav {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding-bottom: 5px;
  }
  .admin-shell--moments .admin-sidebar nav a {
    flex-shrink: 0;
    padding: 8px 10px;
  }
  .admin-shell--moments .admin-workspace {
    min-width: 0;
    width: 100%;
    margin: 0;
  }
  .admin-shell--moments .admin-main {
    padding: 25px 20px;
  }
  .admin-shell--moments :deep(.admin-page-heading) {
    align-items: flex-start;
    flex-direction: column;
  }
  .admin-shell--moments :deep(.admin-filters) {
    flex-wrap: wrap;
  }
}
@media (max-width: 760px) {
  .admin-shell--moment-editor .admin-sidebar {
    display: none;
  }
  .admin-shell--moment-editor .admin-main {
    padding: 14px 14px max(24px, env(safe-area-inset-bottom));
  }
}
</style>
