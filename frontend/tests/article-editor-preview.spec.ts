import { expect, test, type Page } from "@playwright/test";
import { blankContent, type Content } from "../src/lib/types";

async function fixture(page: Page) {
  const state = {
    article: {
      ...blankContent("article"),
      id: 42,
      title: "文章预览验收",
      body: "## 预览标题\n\n**加粗文字**\n\n| 项目 | 状态 |\n| --- | --- |\n| 预览 | 正常 |\n\n<script>window.unsafe = true</script>",
      images: ["/avatar.jpg"],
    } as Content,
    saved: [] as Content[],
    errors: [] as string[],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/me"))
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    if (path === "/api/admin/contents/42") {
      if (route.request().method() === "PUT") {
        state.article = route.request().postDataJSON();
        state.saved.push(state.article);
        return route.fulfill({ json: { id: 42 } });
      }
      return route.fulfill({ json: state.article });
    }
    if (path === "/api/admin/contents/7")
      return route.fulfill({
        json: { ...blankContent("project"), id: 7, title: "作品" },
      });
    return route.fulfill({ json: { items: [], total: 0, page: 1, pages: 0 } });
  });
  return state;
}

test("文章原文和渲染互斥显示，切换保留光标，预览模式仍能保存 Markdown", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/admin/contents/42");
  const source = page.getByRole("textbox", {
    name: "Markdown 正文",
    exact: true,
  });
  const preview = page.locator(".editor-preview");
  const toggle = page.getByRole("tab", {
    name: "预览",
    exact: true,
  });
  const write = page.getByRole("tab", { name: "编写", exact: true });
  await expect(source).toHaveValue(state.article.body);
  await expect(source).toBeVisible();
  await expect(preview).toBeHidden();
  await expect(write).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("修改已保存", { exact: false })).toBeVisible();
  const widths = await page.locator(".editor-single").evaluate((el) => ({
    body: el.getBoundingClientRect().width,
    source: el.querySelector(".editor-source")!.getBoundingClientRect().width,
  }));
  expect(Math.abs(widths.body - widths.source)).toBeLessThan(1);
  await source.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(3, 7);
  });
  await page.locator(".markdown-editor").screenshot({
    path: "../.local/article-editor-source.png",
    animations: "disabled",
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-selected", "true");
  await expect(source).toBeHidden();
  await expect(preview).toBeVisible();
  await expect(preview.locator("h2")).toHaveText("预览标题");
  await expect(preview.locator("strong")).toHaveText("加粗文字");
  await expect(preview.locator("table")).toBeVisible();
  await expect(preview.locator("script")).toHaveCount(0);
  await expect(preview.locator(".gallery img")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "插入加粗", exact: true }),
  ).toBeHidden();
  await expect(page.getByText("修改已保存", { exact: false })).toBeVisible();
  await page.locator(".markdown-editor").screenshot({
    path: "../.local/article-editor-preview.png",
    animations: "disabled",
  });
  await toggle.focus();
  await toggle.press("ArrowLeft");
  await expect(write).toBeFocused();
  await expect(source).toBeVisible();
  await expect(preview).toBeHidden();
  expect(
    await source.evaluate((el: HTMLTextAreaElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([3, 7]);
  await expect(source).toHaveValue(state.article.body);
  await expect(
    page.getByRole("button", { name: "插入加粗", exact: true }),
  ).toBeEnabled();
  await source.fill("需要加粗");
  await source.selectText();
  await page.getByRole("button", { name: "插入加粗", exact: true }).click();
  await expect(source).toHaveValue("**需要加粗**");
  await toggle.click();
  await expect(preview.locator("strong")).toHaveText("需要加粗");
  await page.keyboard.press("Control+s");
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0]!.body).toBe("**需要加粗**");
  await expect(page.getByText("修改已保存", { exact: false })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("新文章可查看空预览，预览不触发修改提醒，作品编辑仍保持并排", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/admin/contents/new");
  const toggle = page.getByRole("tab", {
    name: "预览",
    exact: true,
  });
  await toggle.click();
  await expect(page.locator(".preview-placeholder")).toBeVisible();
  await page.getByRole("link", { name: "返回文章管理", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/contents$/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.goto("/admin/contents/42");
  await page
    .getByRole("textbox", { name: "Markdown 正文", exact: true })
    .fill("未保存的正文");
  await toggle.click();
  await page.getByRole("link", { name: "返回文章管理", exact: true }).click();
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".preview-body")).toContainText("未保存的正文");
  await page.getByRole("link", { name: "返回文章管理", exact: true }).click();
  await page
    .getByRole("button", { name: "放弃修改并离开", exact: true })
    .click();
  await page.goto("/admin/projects/7");
  await expect(
    page.getByRole("textbox", { name: "Markdown 正文", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".editor-preview")).toBeVisible();
  await expect(toggle).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("正文右下角可拖动调整高度，切换预览后保留大小和文字", async ({ page }) => {
  const state = await fixture(page);
  state.article.body = Array.from(
    { length: 50 },
    (_, i) => `第 ${i + 1} 行正文`,
  ).join("\n");
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/admin/contents/42");
  const source = page.getByRole("textbox", {
    name: "Markdown 正文",
    exact: true,
  });
  await expect(source).toHaveValue(state.article.body);
  await source.scrollIntoViewIfNeeded();
  const original = (await source.boundingBox())!;
  async function resize(delta: number) {
    const bounds = (await source.boundingBox())!;
    await page.mouse.move(
      bounds.x + bounds.width - 4,
      bounds.y + bounds.height - 4,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width - 4,
      bounds.y + bounds.height - 4 + delta,
      { steps: 12 },
    );
    await page.mouse.up();
  }
  await resize(120);
  await expect
    .poll(async () => (await source.boundingBox())!.height)
    .toBeGreaterThan(original.height + 80);
  const expanded = (await source.boundingBox())!;
  expect(Math.abs(expanded.width - original.width)).toBeLessThan(1);
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  await page.getByRole("tab", { name: "编写", exact: true }).click();
  await expect
    .poll(async () =>
      Math.abs((await source.boundingBox())!.height - expanded.height),
    )
    .toBeLessThan(1);
  await source.scrollIntoViewIfNeeded();
  await resize(-90);
  await expect
    .poll(async () => (await source.boundingBox())!.height)
    .toBeLessThan(expanded.height - 60);
  await expect(source).toHaveValue(state.article.body);
  await expect(page.getByText("修改已保存", { exact: false })).toBeVisible();
  expect(state.saved).toEqual([]);
  expect(state.errors).toEqual([]);
});
