import { expect, test, type Page } from "@playwright/test";
import { blankContent, type Content } from "../src/lib/types";

async function fixture(page: Page, kind: Content["kind"], drafts = 16) {
  const state = {
    items: Array.from({ length: 16 + drafts }, (_, i): Content => ({
      ...blankContent(kind),
      id: i + 1,
      title: `记录 ${i + 1}`,
      body: `记录 ${i + 1} 的完整正文`,
      status: i < 16 ? "published" : "draft",
      updated_at: "2026-11-06T01:00:00Z",
    })),
    errors: [] as string[],
  };
  page.on("pageerror", (e) => state.errors.push(e.message));
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/me"))
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    const detail = url.pathname.match(/\/contents\/(\d+)$/);
    if (detail) {
      const id = Number(detail[1]);
      if (request.method() === "PUT") {
        state.items = state.items.map((c) =>
          c.id === id ? request.postDataJSON() : c,
        );
        return route.fulfill({ json: { id } });
      }
      if (request.method() === "DELETE") {
        state.items = state.items.filter((c) => c.id !== id);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: state.items.find((c) => c.id === id) });
    }
    if (url.pathname.endsWith("/contents")) {
      const items = state.items.filter(
        (c) =>
          c.kind === url.searchParams.get("kind") &&
          (!url.searchParams.get("status") ||
            c.status === url.searchParams.get("status")) &&
          `${c.title} ${c.body}`.includes(url.searchParams.get("q") || ""),
      );
      const current = Number(url.searchParams.get("page") || 1);
      return route.fulfill({
        json: {
          items: items.slice((current - 1) * 15, current * 15),
          total: items.length,
          page: current,
          pages: Math.ceil(items.length / 15),
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  return state;
}

for (const [section, kind] of [
  ["contents", "article"],
  ["moments", "moment"],
] as const) {
  test(`${kind} 的发布和草稿页签独立筛选、分页、搜索，并支持刷新与后退`, async ({
    page,
  }) => {
    const state = await fixture(page, kind);
    await page.addInitScript(() => {
      document.addEventListener("animationstart", (event) => {
        if (event.animationName.startsWith("admin-view-")) {
          document.documentElement.dataset.adminAnimations =
            (document.documentElement.dataset.adminAnimations || "") +
            event.animationName +
            ",";
          if ((event.target as HTMLElement).classList.contains("route-page"))
            document.documentElement.dataset.adminPageAnimated = "yes";
        }
      });
    });
    const statuses = page.getByRole("navigation", {
      name: "发布状态",
      exact: true,
    });
    const published = statuses.getByRole("link", {
      name: "已发布",
      exact: true,
    });
    const draft = statuses.getByRole("link", { name: "草稿箱", exact: true });
    const rows = page.locator(".content-table tbody tr");
    await page.goto(`/admin/${section}`);
    await expect(published).toHaveAttribute("aria-current", "page");
    await expect(published).toHaveClass(/\bproject-pill\b/);
    await expect(published).toHaveCSS("border-radius", "22px");
    await expect(page.getByRole("combobox", { name: "发布状态" })).toHaveCount(
      0,
    );
    await expect(rows).toHaveCount(15);
    await expect(page.locator("tbody .status-badge.published")).toHaveCount(15);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("记录 16");
    await draft.click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/${section}\\?status=draft$`),
    );
    await expect(rows).toHaveCount(15);
    await expect(page.locator("tbody .status-badge.draft")).toHaveCount(15);
    await page.goBack();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("记录 16");
    await page.goForward();
    await expect(rows).toHaveCount(15);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("记录 32");
    await page.reload();
    await expect(draft).toHaveAttribute("aria-current", "page");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("记录 32");
    await page.getByRole("textbox", { name: "搜索内容" }).fill("不存在的记录");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.locator(".empty-panel")).toContainText(
      "还没有符合条件的内容",
    );
    expect(new URL(page.url()).searchParams.get("page")).toBeNull();
    expect(new URL(page.url()).searchParams.get("status")).toBe("draft");
    await page.getByRole("textbox", { name: "搜索内容" }).fill("记录");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(rows).toHaveCount(15);
    await published.focus();
    await published.press("Enter");
    expect(new URL(page.url()).searchParams.get("q")).toBe("记录");
    await expect(page.locator("tbody .status-badge.published")).toHaveCount(15);
    await page.screenshot({
      path: `../.local/admin-${section}-published.png`,
      animations: "disabled",
    });
    await draft.click();
    await expect(page.locator("tbody .status-badge.draft")).toHaveCount(15);
    await page.screenshot({
      path: `../.local/admin-${section}-drafts.png`,
      animations: "disabled",
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-admin-animations",
      /admin-view-arrive/,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-admin-animations",
      /admin-view-depart/,
    );
    await page
      .locator("html")
      .evaluate((el) => el.removeAttribute("data-admin-page-animated"));
    await page
      .locator(
        `.admin-sidebar nav a[href="/admin/${kind === "article" ? "moments" : "contents"}"]`,
      )
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-admin-page-animated",
      "yes",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .locator(`.admin-sidebar nav a[href="/admin/${section}"]`)
      .click();
    await expect(published).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".admin-main > .route-page")).toHaveCSS(
      "animation-name",
      "none",
    );
    await draft.click();
    await expect(draft).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".admin-view")).toHaveCSS(
      "animation-name",
      "none",
    );
    expect(state.errors).toEqual([]);
  });

  test(`${kind} 发布、撤回和删除末页最后一条记录后回到有效页码`, async ({
    page,
  }) => {
    const state = await fixture(page, kind, 15);
    const statuses = page.getByRole("navigation", {
      name: "发布状态",
      exact: true,
    });
    const rows = page.locator(".content-table tbody tr");
    await page.goto(`/admin/${section}?page=2&q=记录`);
    await expect(rows).toHaveCount(1);
    await page.getByRole("button", { name: "撤回", exact: true }).click();
    await expect(page).toHaveURL(/page=1/);
    await expect(rows).toHaveCount(15);
    expect(new URL(page.url()).searchParams.get("q")).toBe("记录");
    expect(state.items.find((c) => c.id === 16)?.status).toBe("draft");
    expect(state.items.find((c) => c.id === 16)?.body).toBe(
      "记录 16 的完整正文",
    );
    await statuses.getByRole("link", { name: "草稿箱", exact: true }).click();
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("记录 31");
    await page.getByRole("button", { name: "发布", exact: true }).click();
    await expect(page).toHaveURL(/page=1/);
    expect(new URL(page.url()).searchParams.get("status")).toBe("draft");
    await expect(page.locator("tbody .status-badge.draft")).toHaveCount(15);
    await statuses.getByRole("link", { name: "已发布", exact: true }).click();
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("记录 31");
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(page).toHaveURL(/page=1/);
    await expect(rows).toHaveCount(15);
    expect(state.items.find((c) => c.id === 31)).toBeUndefined();
    expect(state.errors).toEqual([]);
  });
}
