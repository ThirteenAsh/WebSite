import { createRouter, createWebHistory } from "vue-router";
import { session } from "../lib/api";
import PublicLayout from "../layouts/PublicLayout.vue";
import HomeView from "../views/HomeView.vue";
import ListingView from "../views/ListingView.vue";
import DetailView from "../views/DetailView.vue";
import MomentsView from "../views/MomentsView.vue";
import LoginView from "../views/admin/LoginView.vue";
import AdminLayout from "../layouts/AdminLayout.vue";
import DashboardView from "../views/admin/DashboardView.vue";
import ManageView from "../views/admin/ManageView.vue";
import EditorView from "../views/admin/EditorView.vue";
import MomentEditorView from "../views/admin/MomentEditorView.vue";
import MediaView from "../views/admin/MediaView.vue";
import SettingsView from "../views/admin/SettingsView.vue";

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.fullPath === from.fullPath) return;
    return { top: 0 };
  },
  routes: [
    {
      path: "/",
      component: PublicLayout,
      children: [
        { path: "", component: HomeView, meta: { title: "首页" } },
        {
          path: "projects",
          component: ListingView,
          props: { mode: "projects" },
          meta: { title: "作品集" },
        },
        {
          path: "articles",
          component: ListingView,
          props: { mode: "articles" },
          meta: { title: "文章" },
        },
        { path: "moments", component: MomentsView, meta: { title: "日常" } },
        {
          path: "search",
          component: ListingView,
          props: { mode: "search" },
          meta: { title: "搜索" },
        },
        { path: "projects/:id", component: DetailView },
        { path: "articles/:id", component: DetailView },
        { path: "moments/:id", component: DetailView, meta: { title: "日常" } },
        {
          path: ":pathMatch(.*)*",
          component: () => import("../views/NotFoundView.vue"),
          meta: { title: "页面不存在" },
        },
      ],
    },
    {
      path: "/admin/login",
      component: LoginView,
      meta: { title: "管理员登录" },
    },
    {
      path: "/admin",
      component: AdminLayout,
      meta: { admin: true },
      children: [
        { path: "", component: DashboardView, meta: { title: "工作台" } },
        {
          path: "projects",
          component: ManageView,
          props: { section: "projects" },
          meta: { title: "作品管理", section: "projects" },
        },
        {
          path: "projects/new",
          component: EditorView,
          meta: { title: "新建作品", section: "projects" },
        },
        {
          path: "projects/:id",
          component: EditorView,
          meta: { title: "编辑作品", section: "projects" },
        },
        {
          path: "contents",
          component: ManageView,
          props: { section: "articles" },
          beforeEnter: (to) =>
            to.query.kind === "project"
              ? {
                  path: "/admin/projects",
                  query: { ...to.query, kind: undefined },
                }
              : to.query.kind === "moment"
                ? {
                    path: "/admin/moments",
                    query: { ...to.query, kind: undefined },
                  }
                : true,
          meta: { title: "文章管理", section: "articles" },
        },
        {
          path: "contents/new",
          component: EditorView,
          beforeEnter: (to) =>
            to.query.kind === "project"
              ? { path: "/admin/projects/new" }
              : to.query.kind === "moment"
                ? { path: "/admin/moments/new" }
                : true,
          meta: { title: "新建文章", section: "articles" },
        },
        {
          path: "contents/:id",
          component: EditorView,
          meta: { title: "编辑文章", section: "articles" },
        },
        {
          path: "moments",
          component: ManageView,
          props: { section: "moments" },
          meta: { title: "日常管理", section: "moments" },
        },
        {
          path: "moments/new",
          component: MomentEditorView,
          meta: { title: "记录日常", section: "moments" },
        },
        {
          path: "moments/:id",
          component: MomentEditorView,
          meta: { title: "编辑日常", section: "moments" },
        },
        {
          path: "github",
          redirect: { path: "/admin/projects", query: { view: "github" } },
        },
        { path: "media", component: MediaView, meta: { title: "图片库" } },
        {
          path: "settings",
          component: SettingsView,
          meta: { title: "站点设置" },
        },
      ],
    },
  ],
});
router.beforeEach(async (to) => {
  if (to.matched.some((r) => r.meta.admin)) {
    try {
      await session.check();
    } catch {
      return { path: "/admin/login", query: { next: to.fullPath } };
    }
  }
});
router.afterEach((to) => {
  document.title = `${to.meta.title || "创作记录"} · ThirteenAsh`;
});
export default router;
