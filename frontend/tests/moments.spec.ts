import { expect, test, type Page } from "@playwright/test";
import { blankContent, type Content } from "../src/lib/types";

async function fixture(page: Page) {
  const images = Array.from(
    { length: 9 },
    (_, i) => `/avatar.jpg?image=${i + 1}`,
  );
  const article: Content = {
    ...blankContent("article"),
    id: 70,
    title: "独立的文章",
    summary: "仍然保留文章摘要",
    body: "文章完整正文",
    status: "published",
    published_at: "2026-11-04T01:00:00Z",
  };
  const state = {
    contents: [
      article,
      ...[0, 1, 4, 9].map((count, i): Content => ({
        ...blankContent("moment"),
        id: i + 1,
        title: "旧标题不应显示",
        label: "旧标记不应显示",
        cover_url: "/avatar.jpg?cover",
        body:
          count === 1
            ? ""
            : `**${count} 张图的日常**\n\n[一个链接](https://example.com) <script>window.unsafe = true</script>`,
        images: images.slice(0, count),
        status: "published",
        published_at: "2026-11-04T01:00:00Z",
      })),
    ],
    saved: [] as Record<string, unknown>[],
    uploaded: 0,
    failSave: false,
    failList: false,
    errors: [] as string[],
  };
  page.on("pageerror", (e) => state.errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path === "/api/admin/me")
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    if (path === "/api/site")
      return route.fulfill({
        json: {
          settings: {
            name: "ThirteenAsh",
            avatar_url: "/avatar.jpg",
            skills: [],
          },
          counts: { projects: 0, articles: 1, moments: 4, writings: 5 },
        },
      });
    if (path === "/api/visitor") return route.fulfill({ json: { ok: true } });
    if (path.endsWith("/view"))
      return route.fulfill({ json: { view_count: 1 } });
    if (path.endsWith("/like"))
      return route.fulfill({
        json: {
          liked: request.postDataJSON().liked,
          like_count: request.postDataJSON().liked ? 1 : 0,
        },
      });
    if (path === "/api/admin/uploads") {
      if (request.method() === "POST") {
        state.uploaded++;
        return route.fulfill({
          json: {
            id: state.uploaded,
            url: `/avatar.jpg?uploaded=${state.uploaded}`,
          },
        });
      }
      return route.fulfill({
        json: {
          items: images.map((url, i) => ({
            id: i + 1,
            url,
            original_name: `图片 ${i + 1}`,
          })),
          total: 9,
          page: 1,
          pages: 1,
        },
      });
    }
    if (path === "/api/admin/uploads/groups")
      return route.fulfill({ json: state.contents });
    const detail = path.match(/^\/api\/(?:admin\/)?contents\/(\d+)$/);
    if (request.method() === "POST" || request.method() === "PUT") {
      if (state.failSave)
        return route.fulfill({
          status: 500,
          json: { error: "保存暂时失败，请重试。" },
        });
      const data = request.postDataJSON();
      const id = detail ? Number(detail[1]) : 99;
      state.saved.push(data);
      const c = { ...blankContent("moment"), ...data, id } as Content;
      state.contents = [...state.contents.filter((item) => item.id !== id), c];
      return route.fulfill({ status: detail ? 200 : 201, json: { id } });
    }
    if (detail)
      return route.fulfill({
        json: state.contents.find((c) => c.id === Number(detail[1])),
      });
    if (state.failList)
      return route.fulfill({
        status: 503,
        json: { error: "暂时无法读取日常" },
      });
    const admin = path.includes("/admin/");
    const items = state.contents.filter(
      (c) =>
        c.kind === url.searchParams.get("kind") &&
        (admin
          ? !url.searchParams.get("status") ||
            c.status === url.searchParams.get("status")
          : c.status === "published"),
    );
    return route.fulfill({
      json: { items, total: items.length, page: 1, pages: 1 },
    });
  });
  return state;
}

test("文章与日常独立，0/1/4/9 张图片、Markdown、旧链接和手机深色显示", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/articles");
  await expect(page.locator(".writing-card")).toHaveCount(1);
  await expect(page.locator(".moment-card")).toHaveCount(0);
  await expect(page.locator(".writing-summary")).toHaveText("仍然保留文章摘要");
  await page
    .locator(".desktop-nav")
    .getByRole("link", { name: "日常", exact: true })
    .click();
  await expect(page).toHaveURL(/\/moments$/);
  const cards = page.locator(".moment-card");
  await expect(cards).toHaveCount(4);
  for (const [i, count] of [0, 1, 4, 9].entries()) {
    await expect(cards.nth(i).locator(".gallery img")).toHaveCount(count);
    await expect(
      cards.nth(i).locator("h1, h2, h3, .badge, .card-title, script"),
    ).toHaveCount(0);
  }
  await expect(cards.first().locator("strong")).toHaveText("0 张图的日常");
  await expect(cards.nth(1).locator(".markdown")).toHaveCount(0);
  await expect(page.locator(".moments-page")).not.toContainText(
    "旧标题不应显示",
  );
  await expect(page.locator(".moments-page")).not.toContainText(
    "旧标记不应显示",
  );
  const textBox = await cards.nth(2).locator(".markdown").boundingBox();
  const imageBox = await cards.nth(2).locator(".gallery").boundingBox();
  expect(imageBox!.y).toBeGreaterThanOrEqual(textBox!.y + textBox!.height);
  expect(
    await cards
      .nth(2)
      .locator(".gallery")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(2);
  await cards
    .nth(2)
    .getByRole("button", { name: "查看第 1 张图片", exact: true })
    .click();
  await expect(page.locator(".lightbox[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await cards
    .first()
    .getByRole("button", { name: "点赞", exact: true })
    .click();
  await expect(
    cards.first().getByRole("button", { name: "取消点赞" }),
  ).toContainText("1");
  await page.screenshot({
    path: "../.local/moments-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "../.local/moments-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换为深色模式" }).click();
  await page.screenshot({ path: "../.local/moments-dark.png", fullPage: true });
  await page.goto("/articles/3");
  await expect(page).toHaveURL(/\/moments\/3$/);
  await expect(page.locator(".moment-card .gallery img")).toHaveCount(4);
  await expect(page.locator(".detail-header")).toHaveCount(0);
  await page.goto("/admin/contents/3");
  await expect(page).toHaveURL(/\/admin\/moments\/3$/);
  await expect(page.locator(".moment-edit-grid img")).toHaveCount(4);
  expect(state.errors).toEqual([]);
});

test("日常编辑支持排序、预览、草稿恢复及发布，文章编辑保持独立", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/admin/moments/new");
  await expect(page.locator(".title-input, .editor-aside")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "内容形式" })).toHaveCount(0);
  await expect(page.getByText("内容标记", { exact: false })).toHaveCount(0);
  await page
    .getByLabel("Markdown 配文")
    .fill("**一条新日常**\n\n文字在上，图片在下。");
  for (const i of [1, 2, 3]) {
    await page.getByRole("button", { name: "从图片库选择" }).click();
    await page
      .getByRole("button", { name: `使用 图片 ${i}`, exact: true })
      .click();
  }
  const thumbs = page.locator(".moment-edit-grid img");
  await page
    .getByRole("button", { name: "前移第 3 张图片", exact: true })
    .click();
  await expect(thumbs.nth(1)).toHaveAttribute("src", "/avatar.jpg?image=3");
  await page
    .locator(".moment-edit-image")
    .nth(0)
    .dragTo(page.locator(".moment-edit-image").nth(2));
  await expect(thumbs.nth(2)).toHaveAttribute("src", "/avatar.jpg?image=1");
  await page
    .getByRole("button", { name: "移除第 2 张配图", exact: true })
    .click();
  await expect(thumbs).toHaveCount(2);
  await page.getByRole("button", { name: "预览日常", exact: true }).click();
  await expect(page.locator(".moment-composer-preview strong")).toHaveText(
    "一条新日常",
  );
  await expect(
    page.locator(".moment-composer-preview .gallery img").first(),
  ).toHaveAttribute("src", "/avatar.jpg?image=3");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/moments\/99$/);
  expect(Object.keys(state.saved[0]!).sort()).toEqual([
    "body",
    "images",
    "kind",
    "status",
  ]);
  await page.reload();
  await expect(thumbs).toHaveCount(2);
  await expect(thumbs.nth(0)).toHaveAttribute("src", "/avatar.jpg?image=3");
  await expect(thumbs.nth(1)).toHaveAttribute("src", "/avatar.jpg?image=1");
  await page.getByRole("button", { name: "发布日常", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("已发布");
  await page.getByRole("button", { name: "撤回为草稿", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("草稿");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "前移第 2 张图片", exact: true })
    .click();
  await page.screenshot({
    path: "../.local/moment-editor-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Markdown 配文").press("Control+s");
  await expect(page.getByText("修改已保存", { exact: true })).toBeVisible();
  await page.goto("/admin/contents/new");
  await expect(page.locator(".title-input")).toBeVisible();
  await expect(page.getByLabel("Markdown 正文")).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("批量上传、九张上限、空内容校验、失败保留及离开提醒", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/admin/moments/new");
  await page.getByRole("button", { name: "发布日常", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "这条日常还是空的" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我知道了", exact: true }).click();
  const files = Array.from({ length: 10 }, (_, i) => ({
    name: `image-${i}.png`,
    mimeType: "image/png",
    buffer: Buffer.from("fixture-image"),
  }));
  const upload = page.getByRole("button", { name: "上传图片", exact: true });
  await upload.click();
  const dialog = page.getByRole("dialog", { name: "上传图片", exact: true });
  const input = dialog.getByLabel("选择图片文件");
  await input.setInputFiles(files);
  await expect(dialog.getByRole("alert")).toContainText("还可添加 9 张图片");
  expect(state.uploaded).toBe(0);
  await input.setInputFiles(files.slice(0, 9));
  await expect(dialog.getByText("等待上传", { exact: true })).toHaveCount(9);
  expect(state.uploaded).toBe(0);
  await dialog.getByRole("button", { name: "开始上传", exact: true }).click();
  await expect(dialog.getByText("上传完成", { exact: true })).toHaveCount(9);
  await dialog.getByRole("button", { name: "关闭图片选择" }).click();
  await expect(page.locator(".moment-edit-grid img")).toHaveCount(9);
  await expect(upload).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "从图片库选择" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/moments\/99$/);
  expect(state.saved[0]!.body).toBe("");
  expect(state.saved[0]!.images).toHaveLength(9);
  expect(state.saved[0]!.upload_ids).toHaveLength(9);
  await page.reload();
  await expect(page.locator(".moment-edit-grid img")).toHaveCount(9);
  await page
    .getByRole("button", { name: "移除第 9 张配图", exact: true })
    .click();
  await expect(upload).toBeEnabled();
  await page.getByLabel("Markdown 配文").fill("失败后保留的配文");
  state.failSave = true;
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "日常未保存" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我知道了", exact: true }).click();
  await expect(page.getByLabel("Markdown 配文")).toHaveValue(
    "失败后保留的配文",
  );
  await page.getByRole("link", { name: "返回日常管理", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "离开编辑器？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(page.locator(".moment-edit-grid img")).toHaveCount(8);
  state.failSave = false;
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("修改已保存", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "返回日常管理", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/moments$/);
  await page
    .getByRole("navigation", { name: "发布状态", exact: true })
    .getByRole("link", { name: "草稿箱", exact: true })
    .click();
  await expect(page.locator(".table-title").last()).toHaveText(
    "失败后保留的配文",
  );
  await page.screenshot({
    path: "../.local/moment-management.png",
    fullPage: true,
  });
  expect(state.errors).toEqual([]);
});
