import { expect, test, type Page } from "@playwright/test";
import { blankContent, type Content } from "../src/lib/types";

async function fixture(page: Page) {
  const state = {
    items: [
      {
        ...blankContent("article"),
        id: 42,
        title: "Linux 学习笔记",
        label: "Linux",
        body: "正文",
        status: "published",
      },
      {
        ...blankContent("project"),
        id: 43,
        title: "多语言桌面工具",
        label: "桌面工具",
        body: "作品正文",
        status: "published",
        repo_full_name: "example/tool",
        repo_name: "tool",
        repo_language: "Vue",
        repo_url: "https://github.com/example/tool",
      },
    ] as Content[],
    saved: [] as Content[],
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
          settings: {
            name: "ThirteenAsh",
            avatar_url: "/avatar.jpg",
            skills: [],
            github_url: "https://github.com/ThirteenAsh",
          },
          counts: { projects: 1, writings: 1 },
        },
      });
    const detail = url.pathname.match(/^\/api\/(?:admin\/)?contents\/(\d+)$/);
    if (detail) {
      const id = Number(detail[1]);
      if (request.method() === "PUT") {
        const next = request.postDataJSON() as Content;
        state.items = state.items.map((c) => (c.id === id ? next : c));
        state.saved.push(next);
        return route.fulfill({ json: { id } });
      }
      return route.fulfill({ json: state.items.find((c) => c.id === id) });
    }
    if (url.pathname.endsWith("/contents")) {
      const kind = url.searchParams.get("kind");
      const items = state.items.filter(
        (c) => c.kind === kind || (kind === "writing" && c.kind === "article"),
      );
      return route.fulfill({
        json: { items, total: items.length, page: 1, pages: 1 },
      });
    }
    return route.fulfill({ json: { view_count: 1, ok: true } });
  });
  return state;
}

for (const kind of ["article", "project"] as const) {
  test(`${kind} 标记可每行输入多项，保存、重开、列表和详情按独立标签展示`, async ({
    page,
  }) => {
    const state = await fixture(page);
    const id = kind === "article" ? 42 : 43;
    const adminPath =
      kind === "article" ? "/admin/contents" : "/admin/projects";
    const publicPath = kind === "article" ? "/articles" : "/projects";
    const labels =
      kind === "article"
        ? ["Linux", "操作系统", "学习笔记"]
        : ["桌面工具", "开源项目", "长期维护"];
    await page.goto(`${adminPath}/${id}`);
    const field = page.getByRole("textbox", { name: /内容标记/ });
    await expect(field).toHaveJSProperty("tagName", "TEXTAREA");
    await field.fill(
      ` ${labels[0]} \n\n${labels[1]}\n${labels[0]}\n${labels[2]}`,
    );
    if (kind === "project") {
      await page
        .getByRole("textbox", { name: "主要语言", exact: true })
        .fill(" Vue \nTypeScript\n\nVue\nRust ");
      await expect(page.locator(".repo-card-editor .repo-language")).toHaveText(
        ["Vue", "TypeScript", "Rust"],
      );
    }
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect.poll(() => state.saved.length).toBe(1);
    expect(state.saved[0]!.label).toBe(labels.join("\n"));
    if (kind === "project")
      expect(state.saved[0]!.repo_overrides.language).toBe(
        "Vue\nTypeScript\nRust",
      );
    await page.reload();
    await expect(field).toHaveValue(labels.join("\n"));
    if (kind === "project")
      await expect(
        page.getByRole("textbox", { name: "主要语言", exact: true }),
      ).toHaveValue("Vue\nTypeScript\nRust");
    await page.goto(publicPath);
    await expect(
      page.locator(
        kind === "article"
          ? ".writing-date .type-dot"
          : ".project-card-top .badge",
      ),
    ).toHaveText(labels);
    await page.goto(`${publicPath}/${id}`);
    await expect(page.locator(".detail-meta .badge")).toHaveText(labels);
    if (kind === "project")
      await expect(page.locator(".repo-language")).toHaveText([
        "Vue",
        "TypeScript",
        "Rust",
      ]);
    await page.screenshot({
      path: `../.local/multiline-${kind}-desktop.png`,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `../.local/multiline-${kind}-mobile.png`,
      animations: "disabled",
    });
    expect(state.errors).toEqual([]);
  });
}

test("主要语言的隐藏、恢复 GitHub 和旧单标签兼容", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/admin/projects/43");
  const language = page.getByRole("textbox", { name: "主要语言", exact: true });
  await expect(language).toHaveValue("Vue");
  await language.fill("TypeScript\nRust");
  await expect(page.locator(".repo-language")).toHaveText([
    "TypeScript",
    "Rust",
  ]);
  await language.fill("");
  await expect(page.locator(".repo-language")).toHaveCount(0);
  await page.getByRole("button", { name: "保存并更新", exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0]!.repo_overrides.language).toBe("");
  await page.reload();
  await expect(language).toHaveValue("");
  await page
    .getByRole("button", { name: "主要语言：恢复 GitHub 信息", exact: true })
    .click();
  await expect(language).toHaveValue("Vue");
  await expect(page.locator(".repo-language")).toHaveText(["Vue"]);
  await page.getByRole("button", { name: "保存并更新", exact: true }).click();
  await expect.poll(() => state.saved.length).toBe(2);
  expect(state.saved[1]!.repo_overrides.language).toBeUndefined();
  await page.goto("/projects/43");
  await expect(page.locator(".detail-meta .badge")).toHaveText(["桌面工具"]);
  await expect(page.locator(".repo-language")).toHaveText(["Vue"]);
  expect(state.errors).toEqual([]);
});
