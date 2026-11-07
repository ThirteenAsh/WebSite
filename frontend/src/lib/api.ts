import { reactive } from "vue";
import type { SiteCounts, SiteSettings, Upload } from "./types";

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
const noticeTimers = new Map<
  number,
  { timer?: number; remaining: number; started: number }
>();
export function notify(text: string, type = "success") {
  const id = ++noticeID;
  notifications.push({ id, text, type });
  noticeTimers.set(id, { remaining: 5500, started: Date.now() });
  resumeNotification(id);
}
export function dismissNotification(id: number) {
  window.clearTimeout(noticeTimers.get(id)?.timer);
  noticeTimers.delete(id);
  const i = notifications.findIndex((notice) => notice.id === id);
  if (i >= 0) notifications.splice(i, 1);
}
export function pauseNotification(id: number) {
  const state = noticeTimers.get(id);
  if (!state || state.timer === undefined) return;
  window.clearTimeout(state.timer);
  state.timer = undefined;
  state.remaining = Math.max(0, state.remaining - (Date.now() - state.started));
}
export function resumeNotification(id: number) {
  const state = noticeTimers.get(id);
  if (!state || state.timer !== undefined) return;
  state.started = Date.now();
  state.timer = window.setTimeout(
    () => dismissNotification(id),
    state.remaining,
  );
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
export function imageFileError(file: File) {
  if (
    !["image/jpeg", "image/png", "image/gif"].includes(file.type) &&
    (file.type || !/\.(jpe?g|png|gif)$/i.test(file.name))
  )
    return "请选择 JPG、PNG 或 GIF 图片";
  if (file.size > 8 * 1024 * 1024) return "单张图片不能超过 8MB";
}
export async function upload(
  file: File,
  options: {
    contentId?: number;
    key: string;
    progress: (percent: number) => void;
    signal: AbortSignal;
  },
): Promise<Upload> {
  const validationError = imageFileError(file);
  if (validationError) throw new Error(validationError);
  options.signal.throwIfAborted();
  const body = new FormData();
  body.append("file", file);
  if (options.contentId) body.append("content_id", String(options.contentId));
  body.append("upload_key", options.key);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.progress(Math.floor((100 * event.loaded) / event.total));
    };
    request.upload.onload = () => options.progress(100);
    request.open("POST", "/api/admin/uploads");
    request.responseType = "json";
    if (session.csrf) request.setRequestHeader("X-CSRF-Token", session.csrf);
    request.onload = () => {
      if (request.status === 401) session.clear();
      const data = request.response;
      if (
        request.status >= 200 &&
        request.status < 300 &&
        data?.id &&
        data.url
      ) {
        resolve(data as Upload);
      } else {
        reject(
          new ApiError(request.status, data?.error || "图片上传失败，请重试"),
        );
      }
    };
    request.onerror = () =>
      reject(new ApiError(0, "连接失败，请检查网络后重试"));
    request.onabort = () => reject(options.signal.reason);
    request.onloadend = () =>
      options.signal.removeEventListener("abort", abort);
    options.signal.addEventListener("abort", abort, { once: true });
    request.send(body);
  });
}
export const site = reactive({
  settings: null as SiteSettings | null,
  counts: { projects: 0, writings: 0 } as SiteCounts,
  loading: false,
  error: "",
  async load() {
    this.loading = true;
    try {
      const data = await api<{
        settings: SiteSettings;
        counts: SiteCounts;
      }>("/site");
      this.settings = data.settings;
      this.counts = data.counts;
      this.error = "";
    } catch (e) {
      this.error = errorMessage(e);
      throw e;
    } finally {
      this.loading = false;
    }
  },
});
