import { test, expect } from "@playwright/test";
import { blankContent } from "../src/lib/types";

test("已导入仓库卡片打开对应作品编辑页，未导入仓库仍可勾选导入", async ({
  page,
}) => {
  let imported = false;
  const importRequests: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projects = [
    { ...blankContent("project"), id: 42, title: "已有作品", repo_id: 90001 },
    { ...blankContent("project"), id: 43, title: "新导入作品", repo_id: 90002 },
  ];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/me") {
      await route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    } else if (path === "/api/admin/github/repos") {
      await route.fulfill({
        json: {
          items: [
            {
              id: 90001,
              name: "existing-repo",
              selected: true,
              content_id: 42,
            },
            {
              id: 90002,
              name: "new-repo",
              selected: imported,
              content_id: imported ? 43 : 0,
            },
          ].map((repo) => ({
            ...repo,
            description: "仓库介绍",
            language: "TypeScript",
            pushed_at: "2026-11-03T12:00:00Z",
            archived: false,
          })),
        },
      });
    } else if (path === "/api/admin/github/import") {
      importRequests.push(route.request().postDataJSON());
      imported = true;
      await route.fulfill({ json: { imported: 1, skipped: 0 } });
    } else if (path === "/api/admin/github/sync") {
      await route.fulfill({
        json: { updated: 1, errors: [], at: "2026-11-06T01:00:00Z" },
      });
    } else if (path === "/api/admin/contents") {
      const featured =
        new URL(route.request().url()).searchParams.get("featured") === "1";
      await route.fulfill({
        json: {
          items: featured ? [] : projects,
          total: featured ? 0 : projects.length,
          page: 1,
          pages: featured ? 0 : 1,
        },
      });
    } else if (path.startsWith("/api/admin/contents/")) {
      const content = projects.find((project) =>
        path.endsWith(`/${project.id}`),
      );
      await route.fulfill({ status: content ? 200 : 404, json: content || {} });
    } else {
      await route.fulfill({ json: { ok: true } });
    }
  });

  await page.goto("/admin/github");
  await expect(page).toHaveURL(/\/admin\/projects\?view=github$/);
  await expect(page.getByRole("heading", { name: "作品管理." })).toBeVisible();
  const views = page.getByRole("navigation", {
    name: "作品管理视图",
    exact: true,
  });
  await expect(views.getByRole("link")).toHaveText([
    "GitHub 导入与同步",
    "全部作品",
    "首页精选",
  ]);
  await expect(views.getByRole("link").first()).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator(".admin-sidebar nav a.selected")).toHaveText(
    "作品管理",
  );
  await expect(
    page
      .locator(".admin-sidebar nav")
      .getByRole("link", { name: "GitHub 导入与同步" }),
  ).toHaveCount(0);
  await views.getByRole("link", { name: "全部作品", exact: true }).click();
  await expect(page.locator(".table-title")).toHaveText(
    projects.map((c) => c.title),
  );
  await expect(page.locator(".github-panel")).toHaveCount(0);
  await views.getByRole("link", { name: "首页精选", exact: true }).click();
  await expect(page.locator(".empty-panel")).toBeVisible();
  await views
    .getByRole("link", { name: "GitHub 导入与同步", exact: true })
    .click();
  await page.getByRole("button", { name: "同步已选项目", exact: true }).click();
  await expect(page.locator(".sync-result")).toContainText(
    "本次同步更新 1 个项目",
  );
  await page.screenshot({
    path: "../.local/admin-projects-github.png",
    animations: "disabled",
  });
  const existing = page.getByRole("link", {
    name: "编辑作品：existing-repo",
    exact: true,
  });
  await expect(existing).toHaveAttribute("href", "/admin/projects/42");
  await expect(existing.locator('input[type="checkbox"]')).toHaveCount(0);

  const newCard = page.locator("label.repo-choice");
  const checkbox = page.getByRole("checkbox", {
    name: "选择 new-repo",
    exact: true,
  });
  await newCard.click();
  await expect(checkbox).toBeChecked();
  await expect(page.locator(".github-import-bar")).toContainText(
    "已选 1 个仓库",
  );
  await newCard.click();
  await expect(checkbox).not.toBeChecked();
  await expect(page).toHaveURL(/\/admin\/projects\?view=github$/);

  await existing.click();
  await expect(page).toHaveURL(/\/admin\/projects\/42$/);
  await expect(page.locator(".title-input")).toHaveValue("已有作品");

  await page.goto("/admin/github");
  await existing.focus();
  await existing.press("Enter");
  await expect(page).toHaveURL(/\/admin\/projects\/42$/);
  await expect(page.locator(".title-input")).toHaveValue("已有作品");

  await page.goto("/admin/github");
  await checkbox.check();
  await page.getByRole("button", { name: "导入选中项目", exact: true }).click();
  const newlyImported = page.getByRole("link", {
    name: "编辑作品：new-repo",
    exact: true,
  });
  await expect(newlyImported).toHaveAttribute("href", "/admin/projects/43");
  expect(importRequests).toEqual([{ ids: [90002] }]);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await newlyImported.click();
  await expect(page).toHaveURL(/\/admin\/projects\/43$/);
  await expect(page.locator(".title-input")).toHaveValue("新导入作品");
  expect(errors).toEqual([]);
});
