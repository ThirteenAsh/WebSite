export interface Content {
  id: number;
  kind: "project" | "article" | "moment";
  label: string;
  title: string;
  summary: string;
  body: string;
  cover_url: string;
  images: string[];
  tech_stack: string[];
  status: "draft" | "published";
  featured: boolean;
  sort_order: number;
  repo_id: number | null;
  repo_full_name: string;
  repo_name: string;
  repo_description: string;
  repo_language: string;
  repo_url: string;
  repo_updated_at: string | null;
  demo_url: string;
  docs_url: string;
  release_url: string;
  view_count: number;
  like_count: number;
  liked: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface SiteSettings {
  name: string;
  tagline: string;
  hero_title: string;
  hero_highlight: string;
  intro: string;
  about: string;
  avatar_url: string;
  github_username: string;
  github_url: string;
  skills: string[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  limit?: number;
}
export interface Upload {
  id: number;
  url: string;
  filename: string;
  original_name: string;
  size_bytes: number;
  width: number;
  height: number;
  created_at: string;
}
export interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  language: string;
  html_url: string;
  pushed_at: string;
  archived: boolean;
  selected: boolean;
}
export interface SyncResult {
  at: string;
  updated: number;
  errors: string[];
  trigger: string;
}
export interface Dashboard {
  total: number;
  published: number;
  drafts: number;
  projects: number;
  views: number;
  likes: number;
  github_sync: string;
}
export const contentPath = (c: Pick<Content, "kind" | "id">) =>
  `/${c.kind === "project" ? "projects" : "articles"}/${c.id}`;
export const kindName = (kind: string) =>
  ({ project: "项目", article: "文章", moment: "日常" })[kind] || kind;
export function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      })
        .format(new Date(value))
        .replaceAll("/", ".")
    : "尚未发布";
}
export function blankContent(kind: Content["kind"] = "article"): Content {
  return {
    id: 0,
    kind,
    label: "",
    title: "",
    summary: "",
    body: "",
    cover_url: "",
    images: [],
    tech_stack: [],
    status: "draft",
    featured: false,
    sort_order: 0,
    repo_id: null,
    repo_full_name: "",
    repo_name: "",
    repo_description: "",
    repo_language: "",
    repo_url: "",
    repo_updated_at: null,
    demo_url: "",
    docs_url: "",
    release_url: "",
    view_count: 0,
    like_count: 0,
    liked: false,
    published_at: null,
    created_at: "",
    updated_at: "",
  };
}
