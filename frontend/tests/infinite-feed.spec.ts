import { expect, test, type Page } from "@playwright/test";
import { blankContent } from "../src/lib/types";

async function fixture(page: Page, home: boolean) {
  const limit = home ? 5 : 12;
  const contents = Array.from({ length: limit * 2 + 1 }, (_, i) => ({
    ...blankContent(home && i % 3 === 0 ? "article" : "moment"),
    id: i + 1,
    title: `记录 ${i + 1}`,
    body: `配文 ${i + 1}，今天也值得记录。`,
    body_preview: `文章 ${i + 1} 的正文预览`,
    status: "published",
    published_at: "2026-11-26T00:00:00Z",
  }));
  const state = {
    failNext: false,
    calls: [] as number[],
    gate: undefined as Promise<void> | undefined,
    errors: [] as string[],
  };
  page.on("pageerror", (e) => state.errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/site")
      return route.fulfill({
        json: {
          settings: { name: "ThirteenAsh", skills: [] },
          counts: {
            projects: 0,
            moments: contents.length,
            writings: contents.length,
          },
        },
      });
    if (url.pathname === "/api/contents") {
      if (url.searchParams.get("kind") === "project")
        return route.fulfill({
          json: { items: [], total: 0, page: 1, pages: 0 },
        });
      const n = Number(url.searchParams.get("page") || 1);
      state.calls.push(n);
      if (n === 2 && state.gate) await state.gate;
      if (n === 2 && state.failNext)
        return route.fulfill({ status: 503, json: { error: "稍后再试" } });
      const items = contents.slice((n - 1) * limit, n * limit);
      if (n === 2) items.unshift(contents[limit - 1]!);
      return route.fulfill({
        json: { items, total: contents.length, page: n, pages: 3 },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return { state, contents, limit };
}

for (const home of [true, false]) {
  test(`${home ? "首页" : "日常"} 下滑自动追加，去重，加载到末页停止`, async ({
    page,
  }) => {
    const { state, contents, limit } = await fixture(page, home);
    await page.goto(home ? "/" : "/moments");
    const cards = page.locator(
      home ? ".writing-list > article" : ".moment-feed > article",
    );
    const loader = page.locator(".infinite-loader");
    await expect(cards).toHaveCount(limit);
    await loader.scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(limit * 2);
    await loader.scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(contents.length);
    await expect(loader).toHaveText("已经到底了");
    await expect(
      page.getByRole("button", { name: "下一页", exact: true }),
    ).toHaveCount(0);
    expect(state.calls).toEqual([1, 2, 3]);
    expect(state.errors).toEqual([]);
  });
}

test("追加失败保留已有记录，手动重试成功且同一页不会并发请求", async ({
  page,
}) => {
  const { state, limit } = await fixture(page, false);
  state.failNext = true;
  await page.goto("/moments");
  const cards = page.locator(".moment-feed > article");
  const loader = page.locator(".infinite-loader");
  await expect(cards).toHaveCount(limit);
  await loader.scrollIntoViewIfNeeded();
  await expect(loader.getByRole("alert")).toContainText("稍后再试");
  await expect(cards).toHaveCount(limit);
  expect(state.calls).toEqual([1, 2]);
  state.failNext = false;
  let release!: () => void;
  state.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await loader.getByRole("button", { name: "重试加载" }).click();
  await expect(loader).toHaveText("正在加载更多…");
  await loader.scrollIntoViewIfNeeded();
  expect(state.calls).toEqual([1, 2, 2]);
  release();
  await expect(cards).toHaveCount(limit * 2);
  expect(state.errors).toEqual([]);
});
