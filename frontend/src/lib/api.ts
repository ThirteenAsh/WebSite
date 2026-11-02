import { reactive } from "vue";
import type { SiteSettings, Upload } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const notifications = reactive<
  { id: number; text: string; type: string }[]
>([]);
let noticeID = 0;
export function notify(text: string, type = "success") {
  const id = ++noticeID;
  notifications.push({ id, text, type });
  window.setTimeout(() => {
    const i = notifications.findIndex((n) => n.id === id);
    if (i >= 0) notifications.splice(i, 1);
  }, 5500);
}
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请稍后重试";
export const session = reactive({
  username: "",
  csrf: "",
  async check() {
    const data = await api<{ username: string; csrf_token: string }>(
      "/admin/me",
    );
    this.username = data.username;
    this.csrf = data.csrf_token;
  },
  async login(username: string, password: string) {
    const data = await api<{ username: string; csrf_token: string }>(
      "/admin/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
    this.username = data.username;
    this.csrf = data.csrf_token;
  },
  clear() {
    this.username = "";
    this.csrf = "";
  },
});
export async function api<T = { ok: boolean }>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET" && session.csrf)
    headers.set("X-CSRF-Token", session.csrf);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "连接失败，请检查后端服务是否已启动");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(response.status, "服务响应异常，请检查后端服务");
  }
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/admin/")) session.clear();
    throw new ApiError(response.status, data.error || "操作失败，请稍后重试");
  }
  return data as T;
}
let visitor: Promise<unknown> | undefined;
export function ensureVisitor() {
  return (visitor ||= api("/visitor", { method: "POST" }).catch((e) => {
    visitor = undefined;
    throw e;
  }));
}
export async function upload(file: File): Promise<Upload> {
  if (!["image/jpeg", "image/png", "image/gif"].includes(file.type))
    throw new Error("请选择 JPG、PNG 或 GIF 图片");
  if (file.size > 8 * 1024 * 1024) throw new Error("单张图片不能超过 8MB");
  const body = new FormData();
  body.append("file", file);
  return api<Upload>("/admin/uploads", { method: "POST", body });
}
export const site = reactive({
  settings: null as SiteSettings | null,
  counts: { projects: 0, writings: 0 },
  async load() {
    const data = await api<{
      settings: SiteSettings;
      counts: { projects: number; writings: number };
    }>("/site");
    this.settings = data.settings;
    this.counts = data.counts;
  },
});
