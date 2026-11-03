import { test, expect } from "@playwright/test";
import { blankContent } from "../src/lib/types";

for (const featuredCount of [3, 0]) {
  test(`首页有 ${featuredCount} 件精选时，不使用普通作品补齐`, async ({
    page,
  }) => {
    const projects = Array.from({ length: 4 }, (_, index) => ({
      ...blankContent("project"),
      id: index + 1,
      title: `作品 ${index + 1}`,
      status: "published",
      featured: index < featuredCount,
      sort_order: index,
    }));
    const featured = projects.filter((project) => project.featured);
    const projectQueries: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/site") {
        return route.fulfill({
          json: {
            settings: {
              name: "ThirteenAsh",
              hero_title: "我的创作空间",
              hero_highlight: "记录与分享",
              intro: "从想法到作品。",
              about: "关于我",
              tagline: "构建 · 学习 · 记录",
              avatar_url: "/avatar.jpg",
              github_username: "ThirteenAsh",
              github_url: "https://github.com/ThirteenAsh",
              skills: [],
            },
            counts: { projects: projects.length, writings: 0 },
          },
        });
      }
      if (url.pathname === "/api/contents") {
        const isProject = url.searchParams.get("kind") === "project";
        if (isProject) projectQueries.push(url.search);
        const items = isProject
          ? url.searchParams.get("featured") === "1"
            ? featured
            : projects
          : [];
        return route.fulfill({
          json: {
            items,
            total: items.length,
            page: 1,
            pages: items.length ? 1 : 0,
          },
        });
      }
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto("/");
    await expect(page.locator("#featured-title")).toBeVisible();
    await expect(page.locator(".home-section .loading-panel")).toHaveCount(0);
    await expect(page.locator(".home-project-grid .card-title h3")).toHaveText(
      featured.map((project) => project.title),
    );
    expect(projectQueries).toEqual(["?kind=project&featured=1&limit=4"]);
    if (!featuredCount) {
      await expect(
        page.getByText("这里会放上值得分享的作品。", { exact: true }),
      ).toBeVisible();
    }
    await page.getByRole("link", { name: "全部作品", exact: true }).click();
    await expect(page.locator(".project-card")).toHaveCount(projects.length);
    expect(errors).toEqual([]);
  });
}
