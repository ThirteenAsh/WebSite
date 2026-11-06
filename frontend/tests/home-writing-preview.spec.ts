import { expect, test } from "@playwright/test";
import { blankContent } from "../src/lib/types";

test("首页按发布顺序混排文章与日常，文章预览和列表详情正常展示", async ({
  page,
}) => {
  const body =
    "这是正文开头，**保留文字，去除 Markdown 标记**。\n\n" +
    "写下学习过程中的观察，也记录每一次从想法到实现的尝试。".repeat(100) +
    "\n\n正文结尾标记。";
  const article = {
    ...blankContent("article"),
    id: 900001,
    title: "一次从想法到实现的记录",
    summary: "这是单独填写的摘要，与正文开头不同。",
    body,
    status: "published",
    published_at: "2026-11-03T00:00:00Z",
  };
  const short = {
    ...article,
    id: 900002,
    title: "今天的小记",
    body: "今天也有新的收获。",
    published_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-04T00:00:00Z",
  };
  const moment = {
    ...blankContent("moment"),
    id: 900003,
    body: "**文章之间的一条日常**",
    images: ["/avatar.jpg"],
    status: "published",
    published_at: "2026-11-02T00:00:00Z",
  };
  const homeQueries: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/contents**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/view"))
      return route.fulfill({ json: { view_count: 1 } });
    if (url.pathname === `/api/contents/${article.id}`)
      return route.fulfill({ json: article });
    if (url.searchParams.get("kind") === "writing")
      homeQueries.push(url.search);
    const items =
      url.searchParams.get("kind") === "project"
        ? []
        : (url.searchParams.get("kind") === "writing"
            ? [article, moment, short]
            : [article, short]
          ).map((c) => ({
            ...c,
            body: c.kind === "moment" ? c.body : "",
            body_preview:
              url.searchParams.get("preview") === "1"
                ? c.body.slice(0, 2000)
                : undefined,
          }));
    return route.fulfill({
      json: { items, total: items.length, page: 1, pages: 1 },
    });
  });
  await page.goto("/");
  await expect(page.locator(".writing-list > article")).toHaveCount(3);
  expect(homeQueries).toEqual(["?kind=writing&limit=5&preview=1"]);
  await expect(page.locator("#writing-title")).toContainText("最近的记录");
  await expect(page.locator("#moments-title")).toHaveCount(0);
  const cards = page.locator(".writing-list > article");
  await expect(cards.nth(0)).toContainText(article.title);
  await expect(cards.nth(1)).toContainText("文章之间的一条日常");
  await expect(cards.nth(1).locator(".gallery img")).toHaveCount(1);
  await expect(cards.nth(1).locator(".moment-date")).toHaveAttribute(
    "href",
    "/moments/900003",
  );
  await expect(cards.nth(2)).toContainText(short.title);
  const preview = page.locator(".writing-body-preview").first();
  await expect(preview).toContainText(
    "这是正文开头，保留文字，去除 Markdown 标记",
  );
  await expect(preview).not.toContainText(article.summary);
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1040 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await preview.scrollIntoViewIfNeeded();
    const size = await preview.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        height: el.clientHeight,
        fullHeight: el.scrollHeight,
        lineHeight: parseFloat(style.lineHeight),
        mask: style.maskImage,
      };
    });
    expect(size.height / size.lineHeight).toBeGreaterThan(2.8);
    expect(size.height / size.lineHeight).toBeLessThanOrEqual(3.1);
    expect(size.fullHeight).toBeGreaterThan(size.height);
    expect(size.mask).toContain("linear-gradient");
    await expect(page.locator(".writing-body-preview").nth(1)).toHaveText(
      short.body,
    );
    expect(
      await page
        .locator(".writing-body-preview")
        .nth(1)
        .evaluate(
          (el) =>
            el.clientHeight < parseFloat(getComputedStyle(el).lineHeight) * 1.2,
        ),
    ).toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.locator(".writing-list").screenshot({
      path: `../.local/home-writing-preview-${viewport.name}.png`,
    });
  }
  await page.getByRole("button", { name: "切换为深色模式" }).click();
  await preview.scrollIntoViewIfNeeded();
  await page
    .locator(".writing-list")
    .screenshot({ path: "../.local/home-writing-preview-dark.png" });
  await page.goto("/articles");
  await expect(page.locator(".writing-body-preview")).toHaveCount(0);
  await expect(page.locator(".writing-summary").first()).toHaveText(
    article.summary,
  );
  await page.locator(".card-title").first().click();
  await expect(page.locator(".detail-body")).toContainText("正文结尾标记。");
  expect(errors).toEqual([]);
});
