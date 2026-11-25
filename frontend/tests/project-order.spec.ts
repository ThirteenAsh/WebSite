import { test, expect, type Page } from "@playwright/test";
import { blankContent, type Content } from "../src/lib/types";

async function fixture(page: Page, count = 4) {
  const state = {
    projects: Array.from({ length: count }, (_, i): Content => ({
      ...blankContent("project"),
      id: 43 + i * 11,
      title: `作品 ${i + 1}`,
      body: "保留完整正文",
      status: "published",
      featured: i % 2 === 0,
      sort_order: i,
    })),
    saves: [] as number[][],
    failSave: false,
    saveGate: null as Promise<void> | null,
    errors: [] as string[],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/me")
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    if (url.pathname === "/api/site")
      return route.fulfill({
        json: {
          settings: { name: "ThirteenAsh", skills: [] },
          counts: { projects: count, articles: 0, moments: 0 },
        },
      });
    if (url.pathname === "/api/admin/projects/order") {
      expect(request.method()).toBe("PUT");
      expect(request.headers()["x-csrf-token"]).toBe("fixture");
      const ids = request.postDataJSON().ids as number[];
      state.saves.push(ids);
      if (state.saveGate) await state.saveGate;
      if (state.failSave)
        return route.fulfill({
          status: 500,
          json: { error: "排序保存失败，请重试" },
        });
      const selected = new Map(state.projects.map((item) => [item.id, item]));
      let index = 0;
      state.projects = state.projects
        .map((item) =>
          ids.includes(item.id) ? selected.get(ids[index++]!)! : item,
        )
        .map((item, i) => ({ ...item, sort_order: i }));
      return route.fulfill({
        json: {
          items: state.projects
            .filter((item) => ids.includes(item.id))
            .map(({ id, sort_order }) => ({ id, sort_order })),
        },
      });
    }
    if (["/api/admin/contents", "/api/contents"].includes(url.pathname)) {
      const admin = url.pathname.includes("/admin/");
      const items = state.projects.filter(
        (item) =>
          (admin || item.status === "published") &&
          (url.searchParams.get("featured") !== "1" || item.featured) &&
          (!url.searchParams.get("q") ||
            item.title.includes(url.searchParams.get("q")!)),
      );
      const current = Number(url.searchParams.get("page") || 1);
      const limit = Number(url.searchParams.get("limit") || 12);
      return route.fulfill({
        json: {
          items: items.slice((current - 1) * limit, current * limit),
          total: items.length,
          page: current,
          pages: Math.ceil(items.length / limit),
        },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return state;
}

test("拖动后自动保存，刷新及展示页保持顺序，项目按 01 起连续编号", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/admin/projects");
  await expect(page.locator(".table-title")).toHaveText([
    "作品 1",
    "作品 2",
    "作品 3",
    "作品 4",
  ]);
  await page.screenshot({
    path: "../.local/project-order-admin.png",
    fullPage: true,
  });
  let finishSave!: () => void;
  state.saveGate = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await page
    .getByRole("button", { name: "拖动排序：作品 1", exact: true })
    .dragTo(page.locator(".content-table tbody tr").nth(2));
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(page.getByRole("status")).toContainText("正在保存作品顺序");
  await expect(
    page.getByRole("button", { name: "下移：作品 2", exact: true }),
  ).toBeDisabled();
  finishSave();
  await expect(page.locator(".toast")).toContainText("作品顺序已保存");
  expect(state.saves).toEqual([[54, 65, 43, 76]]);
  await page.reload();
  await expect(page.locator(".table-title")).toHaveText([
    "作品 2",
    "作品 3",
    "作品 1",
    "作品 4",
  ]);
  await page.goto("/projects");
  await expect(page.locator(".project-card h3")).toHaveText([
    "作品 2",
    "作品 3",
    "作品 1",
    "作品 4",
  ]);
  await expect(page.locator(".project-date strong")).toHaveText([
    "项目 01",
    "项目 02",
    "项目 03",
    "项目 04",
  ]);
  await expect(
    page.locator(".project-card").first().locator(".card-title"),
  ).toHaveAttribute("href", "/projects/54");
  expect(state.projects.every((item) => item.body === "保留完整正文")).toBe(
    true,
  );
  expect(state.errors).toEqual([]);
});

test("排序保存失败恢复原顺序，取消拖动或拖到原位不会提交", async ({ page }) => {
  const state = await fixture(page);
  state.failSave = true;
  await page.goto("/admin/projects");
  const handle = page.getByRole("button", {
    name: "拖动排序：作品 1",
    exact: true,
  });
  await handle.dragTo(page.locator(".content-table tbody tr").nth(1));
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("作品顺序未保存");
  await expect(dialog).toContainText("排序保存失败，请重试");
  await dialog.getByRole("button", { name: "我知道了" }).click();
  await expect(page.locator(".table-title")).toHaveText([
    "作品 1",
    "作品 2",
    "作品 3",
    "作品 4",
  ]);
  await expect(handle).toBeEnabled();
  await handle.dragTo(page.locator(".content-table tbody tr").first());
  await handle.dispatchEvent("dragstart");
  await handle.dispatchEvent("dragend");
  expect(state.saves).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test("精选筛选中的按钮排序保留其他作品位置，并同步首页精选顺序", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/admin/projects?featured=1&q=作品");
  await expect(page.locator(".table-title")).toHaveText(["作品 1", "作品 3"]);
  await page.getByRole("button", { name: "上移：作品 3", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("作品顺序已保存");
  expect(state.saves).toEqual([[65, 43]]);
  await page.getByRole("link", { name: "全部作品", exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator(".table-title")).toHaveText([
    "作品 3",
    "作品 2",
    "作品 1",
    "作品 4",
  ]);
  await page.goto("/");
  await expect(page.locator(".home-project-grid h3")).toHaveText([
    "作品 3",
    "作品 1",
  ]);
  await expect(
    page.locator(".home-project-grid .project-date strong"),
  ).toHaveText(["项目 01", "项目 02"]);
  expect(state.errors).toEqual([]);
});

test("键盘可调整第二页作品，公开页编号跨页连续且草稿不占序号", async ({
  page,
}) => {
  const state = await fixture(page, 17);
  state.projects[0]!.status = "draft";
  await page.goto("/admin/projects?page=2");
  await expect(page.locator(".table-title")).toHaveText(["作品 16", "作品 17"]);
  const handle = page.getByRole("button", {
    name: "拖动排序：作品 17",
    exact: true,
  });
  await handle.focus();
  await handle.press("ArrowUp");
  await expect(page.locator(".toast")).toContainText("作品顺序已保存");
  await expect(page.locator(".table-title")).toHaveText(["作品 17", "作品 16"]);
  await expect(handle).toBeFocused();
  await page.reload();
  await expect(page.locator(".table-title")).toHaveText(["作品 17", "作品 16"]);
  expect(state.projects[14]!.title).toBe("作品 15");
  await page.goto("/projects?page=2");
  await expect(page.locator(".project-card h3")).toHaveText([
    "作品 14",
    "作品 15",
    "作品 17",
    "作品 16",
  ]);
  await expect(page.locator(".project-date strong")).toHaveText([
    "项目 13",
    "项目 14",
    "项目 15",
    "项目 16",
  ]);
  expect(state.errors).toEqual([]);
});

test("保存过程中切换筛选，保存完成后当前列表刷新为最新顺序", async ({
  page,
}) => {
  const state = await fixture(page);
  let finishSave!: () => void;
  state.saveGate = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await page.goto("/admin/projects");
  await page
    .getByRole("button", { name: "拖动排序：作品 1", exact: true })
    .dragTo(page.locator(".content-table tbody tr").nth(2));
  await expect.poll(() => state.saves.length).toBe(1);
  await page.getByRole("link", { name: "首页精选", exact: true }).click();
  await expect(page.locator(".table-title")).toHaveText(["作品 1", "作品 3"]);
  finishSave();
  await expect(page.locator(".toast")).toContainText("作品顺序已保存");
  await expect(page.locator(".table-title")).toHaveText(["作品 3", "作品 1"]);
  await expect(page).toHaveURL(/featured=1/);
  expect(state.errors).toEqual([]);
});
