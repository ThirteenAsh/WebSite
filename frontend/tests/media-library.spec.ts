import { expect, test, type Page } from "@playwright/test";
import { blankContent, type Upload } from "../src/lib/types";

async function fixture(page: Page) {
  const state = {
    article: { ...blankContent("article"), id: 42, title: "安装教程" },
    uploads: Array.from({ length: 29 }, (_, i): Upload => ({
      id: i + 1,
      url: `/avatar.jpg?image=${i + 1}`,
      original_name:
        i < 27
          ? `安装步骤-${i + 1}.png`
          : i === 27
            ? "作品封面.png"
            : "待整理.png",
      content_id: i < 27 ? 42 : i === 27 ? 7 : null,
      filename: `${i + 1}.png`,
      size_bytes: 8000,
      width: 640,
      height: 400,
      created_at: "2026-11-06T00:00:00Z",
    })),
    attempts: [] as { name: string; key: string; contentId: number | null }[],
    claimed: [] as number[],
    waitForUpload: undefined as Promise<void> | undefined,
  };
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (pathname === "/api/admin/me") {
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    }
    if (pathname === "/api/admin/uploads/groups") {
      return route.fulfill({
        json: [
          state.article,
          ...Array.from({ length: 120 }, (_, index) => ({
            id: 100 + index,
            kind: "article",
            title: `归档文章 ${index + 1}`,
          })),
          { id: 7, kind: "project", title: "小工具" },
        ],
      });
    }
    if (pathname === "/api/admin/uploads" && request.method() === "POST") {
      const body = request.postData() || "";
      const name = body.match(/filename="([^"]+)"/)?.[1] || "";
      const key = body.match(/name="upload_key"\r\n\r\n([0-9a-f]+)/)?.[1] || "";
      const contentId =
        Number(body.match(/name="content_id"\r\n\r\n(\d+)/)?.[1]) || null;
      state.attempts.push({ name, key, contentId });
      await state.waitForUpload;
      if (
        name === "retry.png" &&
        state.attempts.filter((item) => item.name === name).length === 1
      ) {
        return route.fulfill({
          status: 503,
          json: { error: "图片暂时无法保存" },
        });
      }
      const image = {
        ...state.uploads[0]!,
        id: 29 + state.attempts.length,
        original_name: name,
        content_id: contentId,
      };
      state.uploads.unshift(image);
      return route.fulfill({ status: 201, json: image });
    }
    if (pathname === "/api/admin/uploads") {
      const scope = searchParams.get("content_id");
      const q = searchParams.get("q") || "";
      const page = Number(searchParams.get("page")) || 1;
      const items = state.uploads.filter(
        (image) =>
          (!scope || (image.content_id || 0) === Number(scope)) &&
          image.original_name.includes(q),
      );
      return route.fulfill({
        json: {
          items: items.slice((page - 1) * 24, page * 24),
          total: items.length,
          page,
          pages: Math.ceil(items.length / 24),
        },
      });
    }
    const group = pathname.match(/^\/api\/admin\/uploads\/(\d+)\/group$/);
    if (group) {
      state.uploads.find((image) => image.id === Number(group[1]))!.content_id =
        request.postDataJSON().content_id;
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === "/api/admin/contents" && request.method() === "POST") {
      const { upload_ids, ...article } = request.postDataJSON();
      state.claimed = upload_ids;
      state.article = { ...article, id: 42 };
      return route.fulfill({ status: 201, json: { id: 42 } });
    }
    return route.fulfill({ json: state.article });
  });
  return state;
}

test("选择器默认按当前文章找图，支持分页和大图，后台可以移动分类", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 740 });
  await page.goto("/admin/contents/42");
  await page.getByRole("button", { name: "插入图片" }).click();
  const picker = page.getByRole("dialog", { name: "选择图片", exact: true });
  const pickerFilter = picker.getByRole("combobox", { name: "图片分类" });
  await expect(pickerFilter).toHaveText("安装教程");
  await pickerFilter.click();
  const list = picker.getByRole("listbox", { name: "图片分类" });
  expect(
    await list.evaluate(
      (el) => el.scrollHeight > el.clientHeight && el.clientHeight < 320,
    ),
  ).toBe(true);
  const search = picker.getByRole("combobox", { name: "搜索分类标题" });
  await expect(search).toBeFocused();
  await search.fill("归档文章 120");
  await expect(list.getByRole("option")).toHaveText(["归档文章 120"]);
  await search.press("Escape");
  await expect(pickerFilter).toBeFocused();
  await expect(list).toBeHidden();
  await expect(picker).toBeVisible();
  await expect(picker.locator(".media-card")).toHaveCount(24);
  const layout = await picker.evaluate((el) => {
    const inner = el.querySelector<HTMLElement>(".media-dialog-scroll")!;
    const card = el.querySelectorAll(".media-card")[3]!;
    return {
      innerScroll: inner.scrollHeight > inner.clientHeight,
      rightGap:
        el.getBoundingClientRect().right - card.getBoundingClientRect().right,
      overflow: getComputedStyle(el).overflowY,
      shadow: getComputedStyle(el).boxShadow,
    };
  });
  expect(layout.innerScroll).toBeTruthy();
  expect(layout.rightGap).toBeGreaterThan(16);
  expect(layout.overflow).toBe("hidden");
  expect(layout.shadow).not.toBe("none");
  await page.screenshot({ path: "../.local/media-picker-groups.png" });

  const previewButton = picker.getByRole("button", {
    name: "预览 安装步骤-1.png",
    exact: true,
  });
  await previewButton.click();
  const viewer = page.getByRole("dialog", { name: "图片预览", exact: true });
  await expect(viewer.getByRole("img")).toHaveAttribute(
    "src",
    "/avatar.jpg?image=1",
  );
  await expect(viewer.getByRole("link", { name: "打开原图" })).toHaveAttribute(
    "href",
    "/avatar.jpg?image=1",
  );
  await viewer.getByRole("button", { name: "下一张图片" }).click();
  await expect(viewer.getByRole("img")).toHaveAttribute(
    "src",
    "/avatar.jpg?image=2",
  );
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(previewButton).toBeFocused();
  await picker.getByRole("button", { name: "下一页" }).click();
  await expect(picker.locator(".media-card")).toHaveCount(3);
  await pickerFilter.click();
  await list.getByRole("option", { name: "全部图片", exact: true }).click();
  await picker.getByLabel("图片文件名").fill("作品封面");
  await picker.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(picker.locator(".media-card")).toHaveCount(1);
  await expect(
    picker.getByRole("button", { name: "使用 作品封面.png" }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "关闭图片选择" }).click();

  await page.goto("/admin/media");
  const libraryFilter = page.getByRole("combobox", { name: "图片分类" });
  await libraryFilter.click();
  await page.getByRole("option", { name: "未归类", exact: true }).click();
  const unassigned = page.locator(".media-card");
  await expect(unassigned).toHaveCount(1);
  await unassigned.getByRole("button", { name: "归类", exact: true }).click();
  const group = page.getByRole("dialog", { name: "图片归类" });
  await group.getByRole("combobox", { name: "归入分类" }).click();
  const groupSearch = group.getByRole("combobox", { name: "搜索分类标题" });
  await groupSearch.fill("小工具");
  await groupSearch.press("Enter");
  await group.getByRole("button", { name: "保存分类" }).click();
  await expect(unassigned).toHaveCount(0);
  await libraryFilter.click();
  await page.getByRole("combobox", { name: "搜索分类标题" }).fill("小工具");
  await page.getByRole("option", { name: "小工具", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "预览 待整理.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "批量上传" }).click();
  const upload = page.getByRole("dialog", { name: "上传图片", exact: true });
  const destination = upload.getByRole("combobox", { name: "上传分类" });
  await expect(destination).toHaveText("小工具");
  await upload.getByLabel("选择图片文件").setInputFiles(
    ["batch.png", "retry.png"].map((name) => ({
      name,
      mimeType: "image/png",
      buffer: Buffer.from("fixture"),
    })),
  );
  await destination.click();
  await upload.getByRole("combobox", { name: "搜索分类标题" }).fill("安装教程");
  await upload.getByRole("option", { name: "安装教程", exact: true }).click();
  await expect(upload).toContainText("上传到 安装教程");
  expect(state.attempts).toEqual([]);
  const gate = Promise.withResolvers<void>();
  state.waitForUpload = gate.promise;
  try {
    await upload.getByRole("button", { name: "开始上传", exact: true }).click();
    await expect(destination).toBeDisabled();
  } finally {
    gate.resolve();
  }
  const retry = upload.getByRole("button", { name: "重试失败项", exact: true });
  await expect(retry).toBeEnabled();
  await expect(destination).toBeDisabled();
  await retry.click();
  await expect(upload.getByText("上传完成", { exact: true })).toHaveCount(2);
  await expect(destination).toBeEnabled();
  expect(
    state.attempts.map(({ name, contentId }) => [name, contentId]),
  ).toEqual([
    ["batch.png", 42],
    ["retry.png", 42],
    ["retry.png", 42],
  ]);
  await upload.getByRole("button", { name: "关闭图片选择" }).click();
  await expect(libraryFilter).toHaveText("小工具");
});

test("选图先进入队列，显示每个文件状态，重试失败项并随草稿归档", async ({
  page,
}) => {
  const state = await fixture(page);
  const gate = Promise.withResolvers<void>();
  state.waitForUpload = gate.promise;
  await page.goto("/admin/contents/new");
  await page.getByLabel("标题", { exact: true }).fill("新文章批量配图");
  await page.getByRole("button", { name: "插入图片" }).click();
  const picker = page.getByRole("dialog", { name: "选择图片", exact: true });
  await expect(picker.getByRole("combobox", { name: "图片分类" })).toHaveText(
    "未归类",
  );
  await picker.getByRole("button", { name: "上传队列", exact: true }).click();
  const input = picker.getByLabel("选择图片文件");
  const file = (name: string) => ({
    name,
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  });
  await input.setInputFiles(file("first.png"));
  await expect(picker.getByText("继续选择", { exact: true })).toBeVisible();
  await input.setInputFiles([file("retry.png"), file("remove.png")]);
  await picker.getByRole("button", { name: "移除队列中的 remove.png" }).click();
  await expect(picker.getByText("等待上传", { exact: true })).toHaveCount(2);
  expect(state.attempts).toEqual([]);
  try {
    await picker.getByRole("button", { name: "开始上传", exact: true }).click();
    await expect(
      picker.getByRole("progressbar", { name: "上传 first.png" }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "关闭图片选择" }),
    ).toBeDisabled();
    await picker.screenshot({ path: "../.local/media-upload-queue.png" });
  } finally {
    gate.resolve();
  }
  await expect(picker.getByText("上传完成", { exact: true })).toHaveCount(1);
  await expect(picker.getByText("图片暂时无法保存")).toBeVisible();
  await picker.getByRole("button", { name: "重试失败项" }).click();
  await expect(picker.getByText("上传完成", { exact: true })).toHaveCount(2);
  expect(state.attempts.map((attempt) => attempt.name)).toEqual([
    "first.png",
    "retry.png",
    "retry.png",
  ]);
  expect(state.attempts[1]!.key).toMatch(/^[0-9a-f]{32}$/);
  expect(state.attempts[2]!.key).toBe(state.attempts[1]!.key);
  await picker.getByRole("button", { name: "关闭图片选择" }).click();
  await expect(page.getByLabel("Markdown 正文")).toHaveValue("");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/contents\/42$/);
  expect(state.claimed).toEqual([30, 32]);
});
