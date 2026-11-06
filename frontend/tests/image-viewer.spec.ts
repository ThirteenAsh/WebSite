import { expect, test, type Page } from "@playwright/test";
import { blankContent } from "../src/lib/types";

async function fixture(page: Page) {
  const images = [
    "/viewer-fixture/landscape.svg",
    "/viewer-fixture/portrait.svg",
    "/avatar.jpg",
    "/viewer-fixture/small.svg",
  ];
  const moment = {
    ...blankContent("moment"),
    id: 7,
    status: "published",
    body: "一些值得留下的画面。",
    images,
  };
  const article = {
    ...blankContent("article"),
    id: 42,
    title: "图片预览",
    status: "published",
    body: "文章里的几张配图。",
    images,
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/viewer-fixture/**", async (route) => {
    const name = new URL(route.request().url()).pathname;
    if (name.endsWith("missing.svg"))
      return route.fulfill({ status: 404, body: "missing" });
    const [width, height] = name.endsWith("portrait.svg")
      ? [800, 2400]
      : name.endsWith("small.svg")
        ? [80, 50]
        : [2400, 800];
    return route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#e6b991"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#fff4dd"/></svg>`,
    });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/site")
      return route.fulfill({
        json: {
          settings: {
            name: "ThirteenAsh",
            avatar_url: "/avatar.jpg",
            skills: [],
            github_url: "https://github.com/ThirteenAsh",
          },
          counts: { projects: 0, articles: 1, moments: 1, writings: 2 },
        },
      });
    if (url.pathname === "/api/contents/42")
      return route.fulfill({ json: article });
    if (url.pathname === "/api/contents")
      return route.fulfill({
        json: {
          items:
            url.searchParams.get("kind") === "moment" ? [moment] : [article],
          total: 1,
          page: 1,
          pages: 1,
        },
      });
    return route.fulfill({ json: { view_count: 1, ok: true } });
  });
  return { images, errors };
}

for (const variant of [
  {
    name: "desktop",
    width: 1440,
    height: 1040,
    path: "/articles/42",
    dark: false,
  },
  { name: "mobile", width: 390, height: 844, path: "/moments", dark: false },
  {
    name: "landscape",
    width: 844,
    height: 390,
    path: "/articles/42",
    dark: true,
  },
  {
    name: "small-mobile",
    width: 320,
    height: 568,
    path: "/moments",
    dark: true,
  },
]) {
  test(`图片弹窗保留边距、完整显示横竖图且小图不放大：${variant.name}`, async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.setViewportSize(variant);
    await page.addInitScript(
      (dark) =>
        localStorage.setItem("dev-notes-theme", dark ? "dark" : "light"),
      variant.dark,
    );
    await page.goto(variant.path);
    const trigger = page.getByRole("button", {
      name: "查看第 1 张图片",
      exact: true,
    });
    const originalOverflow = await page.evaluate(
      () => document.documentElement.style.overflow,
    );
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toHaveClass(/image-viewer-enter-active/);
    await expect(
      page.getByRole("button", { name: "关闭图片", exact: true }),
    ).toBeFocused();
    if (variant.name === "desktop") {
      const close = page.getByRole("button", { name: "关闭图片", exact: true });
      const cross = close.locator(".rounded-close-icon");
      await expect(cross).toHaveCSS("fill-opacity", "1");
      await close.hover();
      await expect(cross).toHaveCSS("fill-opacity", "1");
      await close.screenshot({
        path: "../.local/image-viewer-close-hover.png",
        animations: "disabled",
      });
      await page.mouse.move(2, 2);
      await expect(cross).toHaveCSS("fill-opacity", "1");
      await close.screenshot({
        path: "../.local/image-viewer-close-solid.png",
        animations: "disabled",
      });
    }
    await expect(
      page.getByRole("button", { name: "上一张图片", exact: true }),
    ).toBeDisabled();
    for (let i = 0; i < 4; i++) {
      const img = dialog.locator(".image-viewer-image");
      await expect
        .poll(() =>
          img.evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
        )
        .toBe(true);
      await expect(dialog.locator(".image-viewer-count")).toHaveText(
        `${i + 1} / 4`,
      );
      const geometry = await dialog.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const img = el.querySelector<HTMLImageElement>(".image-viewer-image")!;
        const image = img.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          imageWidth: image.width,
          imageHeight: image.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          inside:
            image.left >= bounds.left &&
            image.right <= bounds.right &&
            image.top >= bounds.top &&
            image.bottom <= bounds.bottom,
        };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(14);
      expect(geometry.right).toBeLessThanOrEqual(variant.width - 14);
      expect(geometry.top).toBeGreaterThanOrEqual(14);
      expect(geometry.bottom).toBeLessThanOrEqual(variant.height - 14);
      expect(geometry.inside).toBe(true);
      expect(geometry.imageWidth).toBeLessThanOrEqual(
        geometry.naturalWidth + 1,
      );
      expect(geometry.imageHeight).toBeLessThanOrEqual(
        geometry.naturalHeight + 1,
      );
      expect(
        Math.abs(
          geometry.imageWidth / geometry.imageHeight -
            geometry.naturalWidth / geometry.naturalHeight,
        ),
      ).toBeLessThan(0.01);
      if (i === 1 || i === 2)
        await page.screenshot({
          path: `../.local/image-viewer-${variant.name}-${i === 1 ? "portrait" : "square"}.png`,
          animations: "disabled",
        });
      await img.click();
      await expect(dialog).toBeVisible();
      if (i < 3) await page.keyboard.press("ArrowRight");
    }
    await expect(
      page.getByRole("button", { name: "下一张图片", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.style.overflow),
    ).toBe(originalOverflow);
    await page
      .getByRole("button", { name: "查看第 2 张图片", exact: true })
      .click();
    await expect(dialog.locator(".image-viewer-count")).toHaveText("2 / 4");
    await page.mouse.click(2, 2);
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await page.getByRole("button", { name: "关闭图片", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(state.errors).toEqual([]);
  });
}

test("图片加载失败仍可关闭，减少动态效果时不播放弹窗动画", async ({ page }) => {
  const state = await fixture(page);
  state.images[0] = "/viewer-fixture/missing.svg";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/moments");
  await page
    .getByRole("button", { name: "查看第 1 张图片", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expect(dialog).toContainText("图片暂时无法加载");
  await expect(dialog).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.style.overflow),
  ).not.toBe("hidden");
  expect(state.errors).toEqual([]);
});
