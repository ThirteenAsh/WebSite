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

test("纸面下拉选择、键盘操作和禁用状态", async ({ page }) => {
  await login(page, "/admin/contents");
  const kind = page.getByRole("combobox", { name: "内容形式" });
  await kind.click();
  await page.getByRole("option", { name: "文章", exact: true }).click();
  await expect(page).toHaveURL(/kind=article/);
  await expect(kind).toHaveText("文章");
  await kind.press("ArrowDown");
  await kind.press("Home");
  await kind.press("Enter");
  await expect(page).toHaveURL(/\/admin\/contents$/);
  const status = page.getByRole("combobox", { name: "发布状态" });
  await status.click();
  await page.getByRole("option", { name: "草稿", exact: true }).click();
  await expect(page).toHaveURL(/status=draft/);
  await status.click();
  await status.press("Escape");
  await expect(status).toHaveAttribute("aria-expanded", "false");
  await status.click();
  await page.locator("h1").click();
  await expect(status).toHaveAttribute("aria-expanded", "false");
  const projects = await (
    await page.request.get("/api/admin/contents?kind=project&limit=1")
  ).json();
  await page.goto(`/admin/contents/${projects.items[0].id}`);
  await expect(page.getByRole("combobox", { name: "内容形式" })).toBeDisabled();
  await page.goto("/admin/contents/new");
  await page.getByRole("combobox", { name: "内容形式" }).click();
  await page.getByRole("option", { name: "短动态", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "内容形式" })).toHaveText(
    "短动态",
  );
  await page.getByRole("combobox", { name: "内容形式" }).click();
  await expect(
    page.locator(".select-pop-enter-active, .select-pop-leave-active"),
  ).toHaveCount(0);
  await expect(page.getByRole("option", { selected: true })).toHaveText(
    "短动态",
  );
  await page.screenshot({
    path: "../.local/paper-select-editor.png",
    fullPage: true,
  });
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
  await page.goto("/");
  await expect(page.locator(".project-card")).toHaveCount(4);
  await expect(
    page.locator(".project-card .project-date").first(),
  ).toBeVisible();
  await expect(
    page.locator(".project-card .repository-link").first(),
  ).toHaveAttribute("target", "_blank");
  await expect(page.locator("h1")).toContainText("把过程留在这里");
  await page.getByRole("button", { name: "切换为深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "切换为浅色模式" }).click();
  await page.screenshot({ path: "../.local/home-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".project-card")).toHaveCount(4);
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

test("短动态图片上传、直接展示、图片引用保护和清理", async ({
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
    await page.getByLabel("Markdown 正文").fill(marker);
    await page.getByRole("button", { name: "添加配图" }).click();
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
    await expect(page.locator(".editor-gallery img")).toHaveCount(1);
    await page.getByRole("button", { name: "发布内容", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/contents\/\d+$/);
    id = Number(page.url().split("/").pop());
    await publicPage.goto("/articles");
    const card = publicPage.locator(".moment-card").filter({ hasText: marker });
    await expect(card).toBeVisible();
    await expect(card.locator(".gallery img")).toHaveCount(1);
    await card.getByRole("button", { name: "查看第 1 张图片" }).click();
    await expect(publicPage.locator(".lightbox[open]")).toBeVisible();
    await publicPage.keyboard.press("Escape");
    const deletion = await page.request.delete(
      `/api/admin/uploads/${imageID}`,
      { headers: { "X-CSRF-Token": token } },
    );
    expect(deletion.status()).toBe(409);
    await page.goto("/admin/media");
    await expect(page.locator(".media-card")).toHaveCount(1);
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
