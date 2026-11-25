import { expect, test, type Page } from "@playwright/test";
import type { SiteSettings } from "../src/lib/types";

async function fixture(page: Page) {
  const state = {
    settings: {
      name: "ThirteenAsh",
      tagline: "构建 · 学习 · 记录",
      hero_title: "创作空间",
      hero_highlight: "记录与分享",
      intro: "个人介绍",
      about: "关于我",
      avatar_url: "/avatar.jpg",
      github_username: "ThirteenAsh",
      github_url: "https://github.com/ThirteenAsh",
      skills: [],
      copyright_text: "bytecraft.com.cn",
      icp_number: "陕ICP备2025084108号-1",
      icp_visible: true,
      icp_url: "https://beian.miit.gov.cn/",
      police_number: "陕公网安备 61012502000363号",
      police_visible: true,
      police_url:
        "https://beian.mps.gov.cn/#/query/webSearch?code=61012502000363",
    } as SiteSettings,
    saved: [] as SiteSettings[],
    failSave: false,
    errors: [] as string[],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/admin/me")
      return route.fulfill({
        json: { username: "tester", csrf_token: "fixture" },
      });
    if (path === "/api/admin/settings") {
      if (request.method() === "PUT") {
        expect(request.headers()["x-csrf-token"]).toBe("fixture");
        if (state.failSave)
          return route.fulfill({
            status: 500,
            json: { error: "保存失败，请稍后重试" },
          });
        state.settings = request.postDataJSON();
        state.saved.push(state.settings);
      }
      return route.fulfill({ json: state.settings });
    }
    if (path === "/api/site")
      return route.fulfill({
        json: {
          settings: state.settings,
          counts: { projects: 0, articles: 0, moments: 0, writings: 0 },
        },
      });
    if (path === "/api/contents")
      return route.fulfill({
        json: { items: [], total: 0, page: 1, pages: 0 },
      });
    return route.fulfill({ json: { ok: true } });
  });
  return state;
}

test("隐藏备案保留自定义信息，刷新后可重新开启", async ({ page }) => {
  const state = await fixture(page);
  state.settings.police_number = "自定义公安备案 123456号";
  state.settings.police_url = "https://example.com/police";
  await page.goto("/admin/settings");
  await page.getByLabel("显示公安备案", { exact: true }).uncheck();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("站点设置已保存");
  await page.goto("/projects");
  await expect(page.locator(".footer-registration")).toContainText(
    state.settings.icp_number,
  );
  await expect(page.locator(".site-footer")).not.toContainText(
    state.settings.police_number,
  );
  await page.goto("/admin/settings");
  await expect(
    page.getByLabel("显示公安备案", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("公安备案号", { exact: true })).toHaveValue(
    "自定义公安备案 123456号",
  );
  await expect(page.getByLabel("公安备案链接", { exact: true })).toHaveValue(
    "https://example.com/police",
  );
  await page.getByLabel("显示公安备案", { exact: true }).check();
  await page.getByLabel("显示 ICP 备案", { exact: true }).uncheck();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("站点设置已保存");
  await page.goto("/projects");
  await expect(
    page.getByRole("link", { name: "自定义公安备案 123456号" }),
  ).toHaveAttribute("href", "https://example.com/police");
  await expect(page.locator(".site-footer")).not.toContainText(
    state.settings.icp_number,
  );
  expect(state.settings.icp_number).toBe("陕ICP备2025084108号-1");
  expect(state.errors).toEqual([]);
});

test("勾选框与文字对齐，页脚输入无默认提示且清空后持久保持空白", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/admin/settings");
  const panel = page
    .locator(".settings-panel")
    .filter({ has: page.getByRole("heading", { name: "页脚与备案信息" }) });
  await expect(panel.getByRole("button", { name: /恢复默认/ })).toHaveCount(0);
  for (const label of [
    "版权文字",
    "ICP备案号",
    "ICP备案链接",
    "公安备案号",
    "公安备案链接",
  ]) {
    const input = page.getByLabel(label, { exact: true });
    expect(await input.getAttribute("placeholder")).toBeNull();
    await input.fill("");
  }
  for (const label of ["显示 ICP 备案", "显示公安备案"]) {
    const checkbox = page.getByLabel(label, { exact: true });
    const alignment = await checkbox.evaluate((input) => {
      const box = input.getBoundingClientRect();
      const text = input
        .parentElement!.querySelector("span")!
        .getBoundingClientRect();
      return {
        centerOffset: Math.abs(
          box.y + box.height / 2 - text.y - text.height / 2,
        ),
        gap: text.x - box.right,
      };
    });
    expect(alignment.centerOffset).toBeLessThan(1);
    expect(alignment.gap).toBeGreaterThanOrEqual(7);
  }
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("站点设置已保存");
  await page.reload();
  await expect(page.getByLabel("公安备案号", { exact: true })).toHaveValue("");
  await expect(panel.locator("input[placeholder]")).toHaveCount(0);
  await panel.screenshot({ path: "../.local/footer-toggle-alignment.png" });
  expect(state.settings.icp_number).toBe("");
  expect(state.settings.police_url).toBe("");
  expect(state.errors).toEqual([]);
});

test("后台修改版权与备案文字、链接后，刷新及公开页正确显示", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/admin/settings");
  await expect(page.getByLabel("版权文字", { exact: true })).toHaveValue(
    "bytecraft.com.cn",
  );
  await expect(page.getByLabel("ICP备案号", { exact: true })).toHaveValue(
    "陕ICP备2025084108号-1",
  );
  const updated = {
    copyright_text: "example.com",
    icp_number: "测ICP备123456号-2",
    icp_url: "https://beian.miit.gov.cn/?site=example",
    police_number: "测公网安备 12345678901234号",
    police_url:
      "https://beian.mps.gov.cn/#/query/webSearch?code=12345678901234",
  };
  for (const [label, value] of [
    ["版权文字", updated.copyright_text],
    ["ICP备案号", updated.icp_number],
    ["ICP备案链接", updated.icp_url],
    ["公安备案号", updated.police_number],
    ["公安备案链接", updated.police_url],
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!);
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("站点设置已保存");
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]).toMatchObject(updated);
  expect(state.settings.intro).toBe("个人介绍");
  await page.reload();
  await expect(page.getByLabel("版权文字", { exact: true })).toHaveValue(
    updated.copyright_text,
  );
  await expect(page.getByLabel("公安备案链接", { exact: true })).toHaveValue(
    updated.police_url,
  );
  await page
    .locator(".settings-panel")
    .filter({ has: page.getByRole("heading", { name: "页脚与备案信息" }) })
    .screenshot({ path: "../.local/footer-settings-admin.png" });
  await page.goto("/projects");
  const footer = page.locator(".site-footer");
  await expect(footer).toContainText(
    `© ${new Date().getFullYear()} · example.com`,
  );
  const registration = page.getByRole("navigation", { name: "网站备案信息" });
  for (const [number, url] of [
    [updated.icp_number, updated.icp_url],
    [updated.police_number, updated.police_url],
  ]) {
    const link = registration.getByRole("link", { name: number, exact: true });
    await expect(link).toHaveAttribute("href", url!);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  await footer.screenshot({ path: "../.local/footer-settings-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(footer).toContainText(updated.police_number);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await footer.screenshot({ path: "../.local/footer-settings-mobile.png" });
  expect(state.errors).toEqual([]);
});

test("备案链接清空时保留纯文字和公安图标", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/admin/settings");
  await page.getByLabel("ICP备案链接", { exact: true }).fill("");
  await page.getByLabel("公安备案链接", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("站点设置已保存");
  await page.goto("/articles");
  const registration = page.getByRole("navigation", { name: "网站备案信息" });
  await expect(registration).toContainText(state.settings.icp_number);
  await expect(registration).toContainText(state.settings.police_number);
  await expect(registration.getByRole("link")).toHaveCount(0);
  await expect(
    registration.locator("span.footer-registration-item"),
  ).toHaveCount(2);
  await expect(registration.locator("img")).toHaveAttribute(
    "src",
    "/beian-police.png",
  );
  expect(state.errors).toEqual([]);
});

test("清空备案号和版权文字后不残留默认信息或分隔符", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/admin/settings");
  await page.getByLabel("版权文字", { exact: true }).fill("");
  await page.getByLabel("ICP备案号", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("站点设置已保存");
  await page.goto("/projects");
  const footer = page.locator(".site-footer");
  await expect(footer.locator("div").first().locator("span")).toHaveText(
    `© ${new Date().getFullYear()}`,
  );
  await expect(
    page.getByRole("navigation", { name: "网站备案信息" }).getByRole("link"),
  ).toHaveCount(1);
  await expect(footer).not.toContainText("ICP备");
  await page.goto("/admin/settings");
  await expect(page.getByLabel("ICP备案号", { exact: true })).toHaveValue("");
  await page.getByLabel("公安备案号", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("站点设置已保存");
  await page.goto("/projects");
  await expect(
    page.getByRole("navigation", { name: "网站备案信息" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".site-footer strong")).toHaveText("ThirteenAsh");
  await expect(
    page.getByRole("navigation", { name: "网站备案信息" }),
  ).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("页脚设置保存失败提示错误并保留原有公开信息", async ({ page }) => {
  const state = await fixture(page);
  state.failSave = true;
  await page.goto("/admin/settings");
  await page.getByLabel("版权文字", { exact: true }).fill("未保存的修改");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("设置未保存");
  await dialog.getByRole("button", { name: "我知道了" }).click();
  await expect(page.getByLabel("版权文字", { exact: true })).toHaveValue(
    "未保存的修改",
  );
  expect(state.saved).toHaveLength(0);
  await page.goto("/projects");
  await expect(page.locator(".site-footer")).toContainText("bytecraft.com.cn");
  expect(state.errors).toEqual([]);
});
