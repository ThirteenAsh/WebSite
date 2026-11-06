import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 凭证只从本机忽略文件或环境变量读取，不写进测试和报告。
const envPath = fileURLToPath(new URL("../../backend/.env", import.meta.url));
const local = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const getEnv = (name: string) =>
  process.env[name] ||
  local.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ||
  "";

test("发布状态筛选、键盘操作和独立编辑入口", async ({ page }) => {
  await login(page, "/admin/contents");
  await expect(page.getByRole("combobox", { name: "内容形式" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "发布状态" })).toHaveCount(0);
  const statuses = page.getByRole("navigation", {
    name: "发布状态",
    exact: true,
  });
  await statuses.getByRole("link", { name: "草稿箱", exact: true }).click();
  await expect(page).toHaveURL(/status=draft/);
  const published = statuses.getByRole("link", { name: "已发布", exact: true });
  await published.focus();
  await published.press("Enter");
  await expect(page).toHaveURL(/\/admin\/contents$/);
  await expect(published).toHaveAttribute("aria-current", "page");
  const projects = await (
    await page.request.get("/api/admin/contents?kind=project&limit=1")
  ).json();
  await page.goto(`/admin/contents/${projects.items[0].id}`);
  await expect(page).toHaveURL(
    new RegExp(`/admin/projects/${projects.items[0].id}$`),
  );
  await expect(page.getByRole("combobox", { name: "内容形式" })).toHaveCount(0);
  const repoName = page.getByLabel("仓库显示名称", { exact: true });
  const originalName = await repoName.inputValue();
  await repoName.fill("暂存的仓库显示名");
  await page
    .getByRole("button", {
      name: "仓库显示名称：恢复 GitHub 信息",
      exact: true,
    })
    .click();
  await expect(repoName).toHaveValue(originalName);
  await page.goto("/admin/contents/new");
  await expect(page.locator(".title-input")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "内容形式" })).toHaveCount(0);
  await page.goto("/admin/contents/new?kind=moment");
  await expect(page).toHaveURL(/\/admin\/moments\/new$/);
  await expect(page.locator(".title-input")).toHaveCount(0);
  await expect(page.getByLabel("Markdown 配文")).toBeVisible();
  await page.screenshot({
    path: "../.local/paper-select-editor.png",
    fullPage: true,
  });
});

test("作品独立管理与仓库卡片编辑、隐藏和恢复", async ({ page, browser }) => {
  const marker = `作品管理验收-${Date.now()}`;
  let id = 0;
  let writingID = 0;
  let token = "";
  const visitor = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
  });
  const publicPage = await visitor.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  publicPage.on("pageerror", (error) => errors.push(error.message));
  async function saveChanges() {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/admin/contents/${id}`) &&
          r.request().method() === "PUT",
      ),
      page.getByRole("button", { name: "保存并更新", exact: true }).click(),
    ]);
    expect(response.ok()).toBeTruthy();
  }
  try {
    await login(page, "/admin/projects/new");
    token = await csrf(page.request);
    await expect(page.getByRole("combobox", { name: "内容形式" })).toHaveCount(
      0,
    );
    await page.locator(".title-input").fill(marker);
    await page.getByLabel("仓库显示名称", { exact: true }).fill("自定义仓库名");
    await page
      .getByLabel("仓库卡片描述", { exact: true })
      .fill("单独维护的仓库描述");
    await page.getByLabel("主要语言", { exact: true }).fill("TypeScript");
    await page.getByLabel("最近推送日期", { exact: true }).fill("2026-10-30");
    await page
      .getByLabel("仓库按钮链接", { exact: true })
      .fill("https://github.com/example/project");
    await page
      .getByLabel("版本与下载链接", { exact: true })
      .fill("https://example.com/download");
    await page
      .getByLabel("在线体验链接", { exact: true })
      .fill("https://example.com/demo");
    await page
      .getByLabel("项目文档链接", { exact: true })
      .fill("https://example.com/docs");
    await page.getByLabel("设为首页精选").check();
    await expect(page.locator(".repo-card-editor .repo-panel h2")).toHaveText(
      "自定义仓库名",
    );
    await page.screenshot({
      path: "../.local/project-editor.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "发布作品", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/projects\/\d+$/);
    id = Number(page.url().split("/").pop());
    await page.reload();
    await expect(page.getByLabel("仓库显示名称", { exact: true })).toHaveValue(
      "自定义仓库名",
    );
    await expect(page.getByLabel("最近推送日期", { exact: true })).toHaveValue(
      "2026-10-30",
    );
    const created = await page.request.post("/api/admin/contents", {
      headers: { "X-CSRF-Token": token },
      data: {
        kind: "article",
        title: `${marker}-文章`,
        body: "独立的文章",
        status: "draft",
      },
    });
    expect(created.ok()).toBeTruthy();
    writingID = (await created.json()).id;
    await page.goto(`/admin/projects?q=${encodeURIComponent(marker)}`);
    await expect(page.locator(".content-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".table-title")).toHaveText(marker);
    await page.getByRole("link", { name: "首页精选", exact: true }).click();
    await expect(page.locator(".table-title")).toHaveText(marker);
    await page.screenshot({
      path: "../.local/project-management.png",
      fullPage: true,
    });
    await page.goto(
      `/admin/contents?status=draft&q=${encodeURIComponent(marker)}`,
    );
    await expect(page.locator(".content-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".table-title")).toHaveText(`${marker}-文章`);
    await expect(page.getByRole("combobox", { name: "内容形式" })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: "../.local/writing-management.png",
      fullPage: true,
    });
    await publicPage.goto(`/search?q=${encodeURIComponent(marker)}`);
    await expect(publicPage.locator(".project-repo-name")).toHaveText(
      "自定义仓库名",
    );
    await expect(publicPage.locator(".project-date time")).toHaveText(
      "2026.10.30",
    );
    await publicPage.goto(`/projects/${id}`);
    await expect(publicPage.locator(".repo-panel h2")).toHaveText(
      "自定义仓库名",
    );
    await expect(publicPage.locator(".repo-panel p")).toHaveText(
      "单独维护的仓库描述",
    );
    await expect(publicPage.locator(".repo-meta")).toContainText("TypeScript");
    await expect(publicPage.locator(".repo-meta")).toContainText("2026.10.30");
    await expect(publicPage.locator(".repo-panel a")).toHaveCount(4);
    await expect(
      publicPage.getByRole("link", { name: "GitHub 仓库" }),
    ).toHaveAttribute("href", "https://github.com/example/project");
    await publicPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await publicPage.screenshot({
      path: "../.local/custom-repo-mobile.png",
      fullPage: true,
    });
    await page.goto(`/admin/projects/${id}`);
    await page.getByLabel("主要语言", { exact: true }).fill("");
    await page.getByLabel("最近推送日期", { exact: true }).fill("");
    await page.getByLabel("仓库按钮链接", { exact: true }).fill("");
    await saveChanges();
    await expect(page.locator(".toast")).toContainText("作品已发布");
    await publicPage.reload();
    await expect(publicPage.locator(".repo-meta")).toHaveCount(0);
    await expect(
      publicPage.getByRole("link", { name: "GitHub 仓库" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "仓库显示名称：恢复默认",
        exact: true,
      })
      .click();
    await expect(page.locator(".repo-card-editor .repo-panel h2")).toHaveText(
      marker,
    );
    await saveChanges();
    await expect(
      page.getByRole("button", {
        name: "仓库显示名称：恢复默认",
        exact: true,
      }),
    ).toHaveCount(0);
    await publicPage.reload();
    await expect(publicPage.locator(".repo-panel h2")).toHaveText(marker);
    expect(errors).toEqual([]);
  } finally {
    if (id && token) await deleteContent(page.request, id, token);
    if (writingID && token) await deleteContent(page.request, writingID, token);
    await visitor.close();
  }
});
async function login(page: Page, next = "/admin") {
  await page.goto(next);
  await expect(page.getByRole("heading", { name: "欢迎回来。" })).toBeVisible();
  await page.getByLabel("管理员账号").fill(getEnv("ADMIN_USERNAME"));
  await page.getByLabel("密码", { exact: true }).fill(getEnv("ADMIN_PASSWORD"));
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.locator(".admin-sidebar")).toBeVisible();
}
async function csrf(request: APIRequestContext) {
  const response = await request.get("/api/admin/me");
  expect(response.ok()).toBeTruthy();
  return (await response.json()).csrf_token as string;
}
async function deleteContent(
  request: APIRequestContext,
  id: number,
  token: string,
) {
  const response = await request.delete(`/api/admin/contents/${id}`, {
    headers: { "X-CSRF-Token": token },
  });
  expect(response.ok()).toBeTruthy();
}

test("公开页面、深浅色和移动端布局", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const featured = await (
    await page.request.get("/api/contents?kind=project&featured=1&limit=4")
  ).json();
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(
    featured.items.length,
  );
  await expect(
    page.locator(".project-card .project-date").first(),
  ).toBeVisible();
  await expect(
    page.locator(".project-card .repository-link").first(),
  ).toHaveAttribute("target", "_blank");
  const { settings } = await (await page.request.get("/api/site")).json();
  await expect(page.locator(".intro-copy h1")).toContainText(
    settings.hero_highlight,
  );
  await page.getByRole("button", { name: "切换为深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "切换为浅色模式" }).click();
  await page.screenshot({ path: "../.local/home-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".project-card")).toHaveCount(
    featured.items.length,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "../.local/home-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "展开导航" }).click();
  await page
    .locator(".mobile-nav")
    .getByRole("link", { name: "作品集" })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(4);
  await page.locator(".project-card .card-title").first().click();
  await expect(page.locator(".repo-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.local/detail-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("Markdown 编辑、草稿隐藏、发布、搜索、点赞和撤回", async ({
  page,
  browser,
}) => {
  const marker = `浏览器验收-${Date.now()}`;
  let id = 0;
  let token = "";
  const visitor = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
  });
  const publicPage = await visitor.newPage();
  try {
    await login(page, "/admin/contents/new");
    token = await csrf(page.request);
    await page.locator(".title-input").fill(marker);
    await page
      .getByLabel("Markdown 正文")
      .fill(
        '## 真实预览\n\n**中文全文检索验收**，支持代码和表格。\n\n```go\nfmt.Println("hello")\n```\n\n| 项目 | 状态 |\n| --- | --- |\n| 发布流程 | 正常 |\n\n<script>window.__unsafe = true</script>',
      );
    await page.getByRole("tab", { name: "预览", exact: true }).click();
    await expect(page.locator(".preview-body h2")).toHaveText("真实预览");
    await expect(page.locator(".preview-body table")).toBeVisible();
    await expect(page.locator(".preview-body script")).toHaveCount(0);
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/contents\/\d+$/);
    id = Number(page.url().split("/").pop());
    await publicPage.goto(`/articles/${id}`);
    await expect(
      publicPage.getByRole("heading", { name: "这篇记录暂时不在这里。" }),
    ).toBeVisible();
    const hidden = await visitor.request.get(
      `/api/contents?q=${encodeURIComponent(marker)}`,
    );
    expect((await hidden.json()).total).toBe(0);
    await page.screenshot({
      path: "../.local/editor-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "发布内容", exact: true }).click();
    await expect(
      page.locator(".editor-aside .status-badge").first(),
    ).toHaveText("已发布");
    await publicPage.goto(`/search?q=${encodeURIComponent(marker)}`);
    await expect(publicPage.locator(".writing-card h3")).toHaveText(marker);
    await publicPage.locator(".writing-card .card-title").click();
    await expect(publicPage.locator(".detail-header h1")).toHaveText(marker);
    await expect(publicPage.locator(".detail-body table")).toBeVisible();
    await expect(publicPage.locator(".notebook-page")).toBeVisible();
    await expect(publicPage.locator(".detail-body.paper-card")).toHaveCount(0);
    await publicPage.screenshot({
      path: "../.local/notebook-desktop.png",
      fullPage: true,
    });
    await publicPage.getByRole("button", { name: "点赞", exact: true }).click();
    await expect(
      publicPage.getByRole("button", { name: "取消点赞" }),
    ).toContainText("1");
    await publicPage.reload();
    await expect(
      publicPage.getByRole("button", { name: "取消点赞" }),
    ).toContainText("1");
    await expect(publicPage.locator(".detail-meta")).toContainText("1 次浏览");
    await publicPage.getByRole("button", { name: "取消点赞" }).click();
    await expect(
      publicPage.getByRole("button", { name: "点赞", exact: true }),
    ).toContainText("0");
    await publicPage.setViewportSize({ width: 375, height: 812 });
    expect(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await publicPage.screenshot({
      path: "../.local/article-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "撤回为草稿" }).click();
    await expect(
      page.locator(".editor-aside .status-badge").first(),
    ).toHaveText("草稿");
    await publicPage.reload();
    await expect(
      publicPage.getByRole("heading", { name: "这篇记录暂时不在这里。" }),
    ).toBeVisible();
  } finally {
    if (id && token) await deleteContent(page.request, id, token);
    await visitor.close();
  }
});

test("日常图片上传、直接展示、旧链接兼容、图片引用保护和清理", async ({
  page,
  browser,
}) => {
  const marker = `图片动态验收-${Date.now()}`;
  let id = 0;
  let imageID = 0;
  let token = "";
  const visitor = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
  });
  const publicPage = await visitor.newPage();
  try {
    await login(page, "/admin/contents/new?kind=moment");
    token = await csrf(page.request);
    await page.getByLabel("Markdown 配文").fill(marker);
    await page.getByRole("button", { name: "从图片库选择" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/uploads") &&
        r.request().method() === "POST",
    );
    await page
      .locator(".media-dialog[open] input[type=file]")
      .setInputFiles(
        fileURLToPath(new URL("../public/avatar.jpg", import.meta.url)),
      );
    const uploaded = await (await responsePromise).json();
    imageID = uploaded.id;
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".moment-edit-grid img")).toHaveCount(1);
    const createdPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/contents") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "发布日常", exact: true }).click();
    const created = await createdPromise;
    expect(created.ok()).toBeTruthy();
    id = (await created.json()).id;
    await expect(page).toHaveURL(/\/admin\/moments\/\d+$/);
    await publicPage.goto("/moments");
    const card = publicPage.locator(".moment-card").filter({ hasText: marker });
    await expect(card).toBeVisible();
    await expect(card.locator(".gallery img")).toHaveCount(1);
    await card.getByRole("button", { name: "查看第 1 张图片" }).click();
    await expect(publicPage.locator(".lightbox[open]")).toBeVisible();
    await publicPage.keyboard.press("Escape");
    await publicPage.goto(`/articles/${id}`);
    await expect(publicPage).toHaveURL(new RegExp(`/moments/${id}$`));
    await expect(publicPage.locator(".moment-card")).toContainText(marker);
    await expect(publicPage.locator(".detail-header")).toHaveCount(0);
    const deletion = await page.request.delete(
      `/api/admin/uploads/${imageID}`,
      { headers: { "X-CSRF-Token": token } },
    );
    expect(deletion.status()).toBe(409);
    await page.goto("/admin/media");
    await expect(
      page.locator(`.media-card img[src="${uploaded.url}"]`),
    ).toBeVisible();
    await page.screenshot({
      path: "../.local/media-desktop.png",
      fullPage: true,
    });
  } finally {
    if (id && token) await deleteContent(page.request, id, token);
    if (imageID && token) {
      const deleted = await page.request.delete(
        `/api/admin/uploads/${imageID}`,
        { headers: { "X-CSRF-Token": token } },
      );
      expect(deleted.ok()).toBeTruthy();
    }
    await visitor.close();
  }
});

test("个人信息保存与退出登录", async ({ page }) => {
  await login(page, "/admin/settings");
  const token = await csrf(page.request);
  const original = await (await page.request.get("/api/admin/settings")).json();
  try {
    await page
      .getByLabel("首页简介", { exact: true })
      .fill("这是一段即将还原的验收简介。");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("站点设置已保存");
    const site = await (await page.request.get("/api/site")).json();
    expect(site.settings.intro).toBe("这是一段即将还原的验收简介。");
  } finally {
    expect(
      (
        await page.request.put("/api/admin/settings", {
          headers: { "X-CSRF-Token": token },
          data: original,
        })
      ).ok(),
    ).toBeTruthy();
  }
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "欢迎回来。" })).toBeVisible();
});

test("真实 GitHub 公开仓库读取与手动同步", async ({ page }) => {
  await login(page, "/admin/github");
  await expect(page.locator(".repo-choice").first()).toBeVisible({
    timeout: 40_000,
  });
  await expect(page.locator(".repo-choice.imported")).toHaveCount(4);
  await page.getByRole("button", { name: "同步已选项目", exact: true }).click();
  await expect(page.locator(".sync-result")).toContainText(
    "本次同步更新 4 个项目",
    { timeout: 40_000 },
  );
  await expect(page.locator(".sync-result .form-error")).toHaveCount(0);
  await page.screenshot({
    path: "../.local/github-desktop.png",
    fullPage: true,
  });
});
