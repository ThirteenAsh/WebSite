import { expect, test, type Page } from "@playwright/test";
import type { SiteSettings } from "../src/lib/types";

const settings: SiteSettings = {
  name: "ThirteenAsh",
  tagline: "构建 · 学习 · 记录",
  hero_title: "这是管理端发布的介绍，",
  hero_highlight: "连接恢复后就能看见。",
  intro: "来自管理端的自我介绍。",
  about: "来自管理端的关于我。",
  avatar_url: "/avatar.jpg",
  github_username: "ThirteenAsh",
  github_url: "https://github.com/ThirteenAsh",
  skills: [],
};
const siteResponse = { settings, counts: { projects: 0, writings: 0 } };
const contentsResponse = { items: [], total: 0, page: 1, pages: 0 };

async function showProfile(page: Page) {
  await page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>(".home-intro")!;
    const stage = document.querySelector<HTMLElement>(".intro-stage")!;
    const header = document.querySelector<HTMLElement>(".site-header")!;
    window.scrollTo({
      top:
        scene.getBoundingClientRect().top +
        window.scrollY -
        header.offsetHeight +
        (scene.offsetHeight - stage.offsetHeight) * 0.9,
      behavior: "instant",
    });
  });
  await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
}

for (const failure of ["连接中断", "服务响应异常"]) {
  test(`后端${failure}时显示活泼提示，重试成功后恢复管理端文案`, async ({
    page,
  }) => {
    let available = false;
    let siteRequests = 0;
    let releaseRetry!: () => void;
    const retryResponse = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/site") siteRequests++;
      if (!available) {
        if (failure === "连接中断") return route.abort("connectionrefused");
        return route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "Service unavailable",
        });
      }
      await retryResponse;
      return route.fulfill({
        json: path === "/api/site" ? siteResponse : contentsResponse,
      });
    });

    try {
      await page.goto("/");
      const heading = page.locator(".intro-copy h1");
      await expect(heading).toContainText("啊哦后端似乎断啦");
      await expect(heading).toContainText("暂时失联啦");
      await expect(heading).not.toContainText("把想法写成代码");
      await expect(page.locator(".terminal-output")).toContainText(
        "暂时失联啦",
      );
      await expect(page.locator(".terminal-files")).toContainText(
        "啊哦，作品清单还没送到。",
      );
      await expect(page.locator(".terminal-files")).not.toContainText(
        "projects/",
      );
      await expect(page.locator(".terminal-status-dot")).toHaveClass(
        /is-offline/,
      );
      if (failure === "连接中断") {
        await expect(page.locator(".terminal-files")).toHaveClass(/is-written/);
        await page.screenshot({
          path: "../.local/home-intro-offline-terminal.png",
          animations: "disabled",
        });
      }
      await showProfile(page);
      const retry = page.getByRole("button", {
        name: "再呼叫一次",
        exact: true,
      });
      await expect(retry).toBeEnabled();
      await expect(page.locator(".intro-meta")).toHaveCount(0);
      if (failure === "连接中断") {
        await page.screenshot({
          path: "../.local/home-intro-offline-profile.png",
          animations: "disabled",
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await showProfile(page);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: "../.local/home-intro-offline-mobile.png",
          animations: "disabled",
        });
      }

      await retry.click();
      await expect.poll(() => siteRequests).toBe(2);
      await expect(retry).toBeEnabled();
      await expect(heading).toContainText("暂时失联啦");

      available = true;
      await retry.click();
      await expect.poll(() => siteRequests).toBe(3);
      await expect(
        page.getByRole("button", { name: "正在呼叫…", exact: true }),
      ).toBeDisabled();
      releaseRetry();
      await expect(heading).toContainText(settings.hero_title);
      await expect(heading).toContainText(settings.hero_highlight);
      await expect(page.locator(".intro-description")).toHaveText(
        settings.intro,
      );
      await expect(page.locator(".intro-retry")).toHaveCount(0);
      await expect(page.locator(".intro-meta a")).toHaveAttribute(
        "href",
        settings.github_url,
      );
      await expect(page.locator(".error-panel")).toHaveCount(0);
      await expect(page.locator(".terminal-status-dot")).not.toHaveClass(
        /is-offline/,
      );
      expect(errors).toEqual([]);
    } finally {
      releaseRetry();
    }
  });
}

test("设置尚在加载时显示等待提示，成功后展示管理端文案", async ({ page }) => {
  let releaseSite!: () => void;
  const siteReady = new Promise<void>((resolve) => {
    releaseSite = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/site") {
      await siteReady;
      return route.fulfill({ json: siteResponse });
    }
    return route.fulfill({ json: contentsResponse });
  });
  try {
    await page.goto("/");
    await showProfile(page);
    const heading = page.locator(".intro-copy h1");
    await expect(heading).toContainText("正在连接创作空间");
    await expect(heading).not.toContainText("啊哦");
    await expect(heading).not.toContainText("把想法写成代码");
    await expect(page.locator(".intro-retry")).toHaveCount(0);
    releaseSite();
    await expect(heading).toContainText(settings.hero_title);
    await expect(page.locator(".intro-description")).toHaveText(settings.intro);
    await expect(page.locator(".intro-retry")).toHaveCount(0);
  } finally {
    releaseSite();
  }
});
