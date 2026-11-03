import { expect, test, type Page } from "@playwright/test";

async function scrollIntro(page: Page, fraction: number) {
  return page.evaluate((fraction) => {
    const scene = document.querySelector<HTMLElement>(".home-intro")!;
    const stage = document.querySelector<HTMLElement>(".intro-stage")!;
    const header = document.querySelector<HTMLElement>(".site-header")!;
    const start = scene.getBoundingClientRect().top + window.scrollY;
    const distance = scene.offsetHeight - stage.offsetHeight;
    const target = start - header.offsetHeight + distance * fraction;
    const expectedFeaturedTop =
      document.querySelector("#featured-title")!.getBoundingClientRect().top +
      window.scrollY -
      target;
    window.scrollTo({ top: target, behavior: "instant" });
    return expectedFeaturedTop;
  }, fraction);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`终端开场只播放一次，后续正常滚动且刷新后重置：${viewport.name}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".terminal-files")).toHaveClass(/is-written/);
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "1");
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "0");
    await expect(page.locator(".intro-scroll")).toBeVisible();
    await expect(page.locator("#featured-title")).not.toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `../.local/home-intro-${viewport.name}-terminal.png`,
      animations: "disabled",
    });

    await scrollIntro(page, 0.9);
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".intro-avatar")).toHaveCSS("opacity", "1");
    await expect(page.locator(".intro-scroll")).toHaveCSS("opacity", "1");
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "0");
    await expect(page.locator(".intro-meta a")).toHaveAttribute(
      "tabindex",
      "0",
    );
    const alignment = await page.evaluate(() => {
      const stage = document
        .querySelector(".intro-stage")!
        .getBoundingClientRect();
      const header = document
        .querySelector(".site-header")!
        .getBoundingClientRect();
      return Math.abs(stage.top - header.bottom);
    });
    expect(alignment).toBeLessThan(2);
    await page.screenshot({
      path: `../.local/home-intro-${viewport.name}-profile.png`,
      animations: "disabled",
    });

    const expectedFeaturedTop = await scrollIntro(page, 1.35);
    await expect(page.locator(".home-intro")).toHaveClass(/is-released/);
    await expect(page.locator(".intro-scroll")).toHaveCSS("opacity", "0");
    await expect(page.locator(".intro-scroll")).toBeHidden();
    await expect(page.locator("#featured-title")).toBeInViewport();
    await expect(page.locator(".home-project-grid")).toBeInViewport();
    await expect
      .poll(async () =>
        Math.abs(
          (await page.locator("#featured-title").boundingBox())!.y -
            expectedFeaturedTop,
        ),
      )
      .toBeLessThan(2);

    await page
      .locator(".home-project-grid .project-card")
      .nth(1)
      .evaluate((card) => {
        const header = document
          .querySelector(".site-header")!
          .getBoundingClientRect();
        window.scrollTo({
          top:
            card.getBoundingClientRect().top +
            window.scrollY -
            header.height / 2,
          behavior: "instant",
        });
      });
    await page.screenshot({
      path: `../.local/home-header-${viewport.name}-card-overlap.png`,
      clip: { x: 0, y: 0, width: viewport.width, height: 240 },
      animations: "disabled",
    });
    await page.getByRole("button", { name: "切换为深色模式" }).click();
    await page.screenshot({
      path: `../.local/home-header-${viewport.name}-card-overlap-dark.png`,
      clip: { x: 0, y: 0, width: viewport.width, height: 240 },
      animations: "disabled",
    });
    await page.getByRole("button", { name: "切换为浅色模式" }).click();

    await scrollIntro(page, 0);
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "0");
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".intro-scroll")).toBeHidden();
    await expect(page.locator(".intro-meta a")).toHaveAttribute(
      "tabindex",
      "0",
    );
    await expect(page.locator("#featured-title")).not.toBeInViewport();
    expect(
      await page.evaluate(() => {
        const scene = document.querySelector<HTMLElement>(".home-intro")!;
        const stage = document.querySelector<HTMLElement>(".intro-stage")!;
        return Math.abs(scene.offsetHeight - stage.offsetHeight);
      }),
    ).toBeLessThan(2);
    await page.reload();
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "1");
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "0");
    await expect(page.locator(".intro-scroll")).toBeVisible();
    await expect(page.locator(".home-intro")).not.toHaveClass(/is-released/);
    expect(errors).toEqual([]);
  });
}

test("减少动态效果时直接展示介绍，没有空白滚动区", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".home-intro")).toHaveClass(/is-static/);
  await expect(page.locator(".terminal-scene")).toBeHidden();
  await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
  await expect(page.locator(".intro-meta a")).toHaveAttribute("tabindex", "0");
  expect(
    await page.locator(".home-intro").evaluate((scene) => scene.clientHeight),
  ).toBeLessThan(800);
  await expect(page.locator("#featured-title")).toBeInViewport();
});

test("键盘切换主题和离开首页后的布局", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "切换为深色模式" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await scrollIntro(page, 0);
  await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "1");
  await page.locator('.desktop-nav a[data-nav="/projects"]').click();
  await expect(page.locator(".home-intro")).toHaveCount(0);
  await expect(page.locator(".site-header")).not.toHaveClass(/home-header/);
  await page.locator('.desktop-nav a[data-nav="/"]').click();
  await expect(page.locator(".home-intro")).toBeVisible();
  await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "0");
});
