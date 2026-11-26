import { expect, test } from "@playwright/test";

test("日常分类使用正文摘要，图片旋转更新缩略图、尺寸并持久保存，失败保留原图", async ({
  page,
}) => {
  let image = {
    id: 1,
    url: "/avatar.jpg",
    original_name: "日常配图.png",
    width: 640,
    height: 400,
    size_bytes: 8000,
    content_id: 68,
    filename: "test.webp",
  };
  let fail = false;
  let gate: Promise<void> | undefined;
  const calls: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/admin/me")
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    if (path === "/api/admin/uploads/groups")
      return route.fulfill({
        json: [
          {
            id: 68,
            kind: "moment",
            title: "",
            body_preview: "**今天去山里散步**，一路遇见很多风景。",
            image_count: 1,
            created_at: "2026-11-26T00:00:00Z",
          },
          {
            id: 69,
            kind: "moment",
            title: "",
            body_preview: "",
            image_count: 3,
            created_at: "2026-11-26T00:00:00Z",
          },
        ],
      });
    if (path.endsWith("/rotate")) {
      expect(request.method()).toBe("PUT");
      expect(request.headers()["x-csrf-token"]).toBe("fixture");
      calls.push(request.postDataJSON().direction);
      if (gate) await gate;
      if (fail)
        return route.fulfill({
          status: 500,
          json: { error: "旋转失败，请重试" },
        });
      image = {
        ...image,
        width: image.height,
        height: image.width,
        url: "/avatar.jpg?v=1",
      };
      return route.fulfill({ json: image });
    }
    if (path === "/api/admin/uploads")
      return route.fulfill({
        json: { items: [image], total: 1, page: 1, pages: 1 },
      });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/media");
  await expect(page.locator(".media-card-group")).toContainText(
    "今天去山里散步，一路遇见很多风景。",
  );
  await page.getByRole("combobox", { name: "图片分类" }).click();
  await expect(
    page.getByRole("option", { name: /今天去山里散步/ }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /3 张图片/ })).toBeVisible();
  await expect(page.getByRole("listbox")).not.toContainText("日常 #");
  await page.keyboard.press("Escape");
  let finish!: () => void;
  gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const rotateButton = page.getByRole("button", {
    name: "向右旋转 日常配图.png",
    exact: true,
  });
  await rotateButton.click();
  await expect(page.locator(".media-card").getByRole("status")).toHaveText(
    "正在旋转并保存…",
  );
  await expect(rotateButton).toBeDisabled();
  finish();
  await expect(page.locator(".media-card img")).toHaveAttribute(
    "src",
    "/avatar.jpg?v=1",
  );
  await expect(page.locator(".media-card-info")).toContainText("400 × 640");
  expect(calls).toEqual(["right"]);
  await page.reload();
  await expect(page.locator(".media-card-info")).toContainText("400 × 640");
  fail = true;
  await page
    .getByRole("button", { name: "向左旋转 日常配图.png", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText("图片旋转未保存");
  await page.getByRole("button", { name: "我知道了" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(page.locator(".media-card img")).toHaveAttribute(
    "src",
    "/avatar.jpg?v=1",
  );
  await expect(page.locator(".media-card-info")).toContainText("400 × 640");
  await page.screenshot({
    path: "../.local/media-rotation.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
