import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { blankContent, type Content } from "../src/lib/types";

async function adminFixture(page: Page, count = 2, allFeatured = false) {
  const state = {
    projects: Array.from({ length: count }, (_, index): Content => ({
      ...blankContent("project"),
      id: index + 1,
      title: `作品 ${index + 1}`,
      body: "完整正文不能因精选切换丢失。",
      summary: "手写摘要",
      status: "published",
      featured: allFeatured || index === 1,
      sort_order: index,
      updated_at: "2026-11-04T00:00:00Z",
      repo_overrides: { name: "自定义仓库名" },
    })),
    saved: [] as Content[],
    deleted: [] as number[],
    failSave: false,
    failLoads: false,
    errors: [] as string[],
    nativeDialogs: [] as string[],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  page.on("dialog", async (dialog) => {
    state.nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/admin/me")
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    if (state.failLoads && path.startsWith("/api/admin/"))
      return route.fulfill({
        status: 503,
        json: { error: "暂时无法读取，请稍后重试。" },
      });
    const match = path.match(/^\/api\/admin\/contents\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      if (request.method() === "PUT") {
        if (state.failSave)
          return route.fulfill({
            status: 500,
            json: { error: "保存失败，请稍后重试。" },
          });
        const content = request.postDataJSON() as Content;
        state.saved.push(content);
        state.projects = state.projects.map((project) =>
          project.id === id ? content : project,
        );
        return route.fulfill({ json: { id } });
      }
      if (request.method() === "DELETE") {
        state.deleted.push(id);
        state.projects = state.projects.filter((project) => project.id !== id);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({
        json: state.projects.find((project) => project.id === id),
      });
    }
    if (path === "/api/admin/contents") {
      const selected = url.searchParams.get("featured") === "1";
      const projects = state.projects.filter(
        (project) => !selected || project.featured,
      );
      const current = Number(url.searchParams.get("page") || 1);
      return route.fulfill({
        json: {
          items: projects.slice((current - 1) * 15, current * 15),
          total: projects.length,
          page: current,
          pages: Math.ceil(projects.length / 15),
        },
      });
    }
    if (path === "/api/admin/uploads")
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pages: 0 },
      });
    return route.fulfill({ json: { ok: true } });
  });
  return state;
}

test("在作品列表切换精选，保留完整内容并刷新精选列表", async ({ page }) => {
  const state = await adminFixture(page);
  await page.goto("/admin/projects");
  const first = page
    .locator(".content-table tbody tr")
    .filter({ hasText: "作品 1" });
  const original = { ...state.projects[0] };
  await first.getByRole("button", { name: "精选", exact: true }).click();
  await expect(
    first.getByRole("button", { name: "取消精选", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(state.saved).toEqual([{ ...original, featured: true }]);
  await expect(
    page.locator(".toast").filter({ hasText: "已设为首页精选" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "首页精选", exact: true }).click();
  await expect(page.locator(".content-table tbody tr")).toHaveCount(2);
  await first.getByRole("button", { name: "取消精选", exact: true }).click();
  await expect(page.locator(".content-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".table-title")).toHaveText(["作品 2"]);
  expect(state.projects[0]?.featured).toBe(false);
  expect(state.errors).toEqual([]);
});

test("取消精选页最后一条记录时回到有效页码并保留筛选", async ({ page }) => {
  const state = await adminFixture(page, 16, true);
  await page.goto("/admin/projects?featured=1&page=2&q=作品");
  await expect(page.locator(".table-title")).toHaveText("作品 16");
  await page.getByRole("button", { name: "取消精选", exact: true }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page).toHaveURL(/featured=1/);
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator(".content-table tbody tr")).toHaveCount(15);
  expect(state.errors).toEqual([]);
});

test("主题删除弹窗默认取消，支持 Escape、焦点恢复和确认删除", async ({
  page,
}) => {
  const state = await adminFixture(page);
  await page.goto("/admin/projects");
  const remove = page
    .locator(".content-table tbody tr")
    .first()
    .getByRole("button", { name: "删除", exact: true });
  await remove.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("heading")).toHaveText("删除作品.");
  await expect(
    dialog.getByRole("button", { name: "取消", exact: true }),
  ).toBeFocused();
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(state.deleted).toEqual([]);
  await remove.click();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(250);
  await mkdir("../.local", { recursive: true });
  await page.screenshot({ path: "../.local/admin-delete-dialog.png" });
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.locator(".table-title")).toHaveText(["作品 2"]);
  expect(state.deleted).toEqual([1]);
  expect(state.nativeDialogs).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("未保存修改的离开提醒可继续编辑，也可确认放弃", async ({ page }) => {
  const state = await adminFixture(page);
  await page.goto("/admin/projects/1");
  await page.locator(".title-input").fill("未保存的新标题");
  await page
    .locator(".admin-sidebar nav")
    .getByRole("link", { name: "作品管理", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("还有未保存的修改");
  await dialog.press("Control+s");
  expect(state.saved).toEqual([]);
  await dialog.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/projects\/1$/);
  await expect(page.locator(".title-input")).toHaveValue("未保存的新标题");
  await page
    .locator(".admin-sidebar nav")
    .getByRole("link", { name: "作品管理", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "放弃修改并离开", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/projects$/);
  expect(state.saved).toEqual([]);
  expect(state.nativeDialogs).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("图片选择器内的错误弹窗显示在最上层，关闭后可继续选择图片", async ({
  page,
}) => {
  const state = await adminFixture(page);
  await page.goto("/admin/projects/1");
  await expect(page.locator(".title-input")).toHaveValue("作品 1");
  state.failLoads = true;
  await page.getByRole("button", { name: "选择封面", exact: true }).click();
  const notice = page.getByRole("alertdialog");
  await expect(notice).toContainText("图片库读取失败");
  await notice.getByRole("button", { name: "我知道了", exact: true }).click();
  await expect(notice).toHaveCount(0);
  const picker = page.locator(".media-dialog[open]");
  await expect(picker).toBeVisible();
  await picker
    .getByRole("button", { name: "关闭图片选择", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("保存失败及各管理页面读取失败使用同一套主题弹窗", async ({ page }) => {
  const state = await adminFixture(page);
  state.failSave = true;
  await page.goto("/admin/projects");
  await page.getByRole("button", { name: "精选", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("精选设置未保存");
  await expect(dialog).toContainText("保存失败，请稍后重试。");
  await dialog.getByRole("button", { name: "我知道了", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "精选", exact: true }),
  ).toBeEnabled();
  expect(state.projects[0]?.featured).toBe(false);
  state.failLoads = true;
  for (const [path, title] of [
    ["/admin", "工作台读取失败"],
    ["/admin/projects", "内容读取失败"],
    ["/admin/contents", "内容读取失败"],
    ["/admin/github", "仓库读取失败"],
    ["/admin/media", "图片库读取失败"],
    ["/admin/settings", "设置读取失败"],
    ["/admin/projects/1", "编辑器打开失败"],
  ]) {
    await page.goto(path!);
    await expect(dialog).toContainText(title!);
    await dialog.getByRole("button", { name: "我知道了", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(state.errors).toEqual([]);
});

test("右下角通知闪出闪回，悬停暂停计时，减少动态效果时正常关闭", async ({
  page,
}) => {
  const state = await adminFixture(page);
  await page.addInitScript(() => {
    (window as any).feedbackAnimations = [];
    document.addEventListener("animationstart", (event) => {
      (window as any).feedbackAnimations.push(event.animationName);
    });
  });
  await page.goto("/admin/projects");
  await page.clock.install();
  await page.getByRole("button", { name: "精选", exact: true }).click();
  const toast = page.locator(".toast");
  await expect(toast).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).feedbackAnimations))
    .toContain("toast-arrive");
  await page.waitForTimeout(280);
  await toast.hover();
  await page.clock.fastForward(10_000);
  await expect(toast).toBeVisible();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(6_000);
  await expect
    .poll(() => page.evaluate(() => (window as any).feedbackAnimations))
    .toContain("toast-return");
  await expect(toast).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .locator(".content-table tbody tr")
    .first()
    .getByRole("button", { name: "取消精选", exact: true })
    .click();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS("animation-name", "none");
  await toast.getByRole("button", { name: "关闭通知" }).click();
  await expect(toast).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("后台原生表单校验以主题弹窗显示，关闭后定位到错误输入", async ({
  page,
}) => {
  const state = await adminFixture(page);
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({ status: 401, json: { error: "请先登录" } }),
  );
  await page.goto("/admin/login");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("请检查填写内容");
  await expect(dialog).toContainText("请填写管理员账号");
  await dialog.getByRole("button", { name: "我知道了", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("管理员账号")).toBeFocused();
  expect(state.errors).toEqual([]);
});
