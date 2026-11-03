import { expect, test, type Page } from "@playwright/test";

async function scrollIntro(page: Page, fraction: number) {
  await page.evaluate((fraction) => {
    const scene = document.querySelector<HTMLElement>(".home-intro")!;
    const stage = document.querySelector<HTMLElement>(".intro-stage")!;
    const header = document.querySelector<HTMLElement>(".site-header")!;
    const style = getComputedStyle(scene);
    const reveal = parseFloat(style.getPropertyValue("--intro-reveal-screens"));
    const hold = parseFloat(style.getPropertyValue("--intro-hold-screens"));
    const distance =
      ((scene.offsetHeight - stage.offsetHeight) * reveal) / (reveal + hold);
    window.scrollTo({
      top:
        scene.getBoundingClientRect().top +
        window.scrollY -
        header.offsetHeight +
        distance * fraction,
      behavior: "instant",
    });
  }, fraction);
}

async function pixels(page: Page, withinProfile = false) {
  return page
    .locator(".intro-confetti canvas")
    .evaluate((element, withinProfile) => {
      const canvas = element as HTMLCanvasElement;
      const bounds = canvas.getBoundingClientRect();
      const density = canvas.width / bounds.width;
      const profile = document
        .querySelector(".intro-profile")!
        .getBoundingClientRect();
      const x = withinProfile
        ? Math.max(0, Math.floor((profile.left - bounds.left) * density))
        : 0;
      const y = withinProfile
        ? Math.max(0, Math.floor((profile.top - bounds.top) * density))
        : 0;
      const width = withinProfile
        ? Math.min(canvas.width - x, Math.floor(profile.width * density))
        : canvas.width;
      const height = withinProfile
        ? Math.min(canvas.height - y, Math.floor(profile.height * density))
        : canvas.height;
      const data = canvas
        .getContext("2d")!
        .getImageData(x, y, width, height).data;
      let count = 0;
      let left = width;
      let right = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index]! > 0) {
          count++;
          const column = ((index - 3) / 4) % width;
          left = Math.min(left, column);
          right = Math.max(right, column);
        }
      }
      return { count, spread: Math.max(0, right - left) / density };
    }, withinProfile);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`开场和彩带每次刷新只播放一次，首次之后恢复正常滚动：${viewport.name}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");
    const layer = page.locator(".intro-confetti");
    await expect(layer).toHaveAttribute("data-phase", "idle");
    expect((await pixels(page)).count).toBe(0);

    await scrollIntro(page, 0.64);
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "0");
    expect((await pixels(page)).count).toBe(0);

    await scrollIntro(page, 0.68);
    await expect(layer).toHaveAttribute("data-phase", "burst");
    await scrollIntro(page, 0.88);
    await expect
      .poll(async () => (await pixels(page)).spread)
      .toBeGreaterThan(viewport.width * 0.35);
    await page.screenshot({
      path: `../.local/home-confetti-${viewport.name}-burst.png`,
      animations: "disabled",
    });
    await expect(layer).toHaveAttribute("data-phase", "settled");
    expect((await pixels(page)).count).toBeGreaterThan(0);
    expect((await pixels(page, true)).count).toBe(0);
    await page.screenshot({
      path: `../.local/home-confetti-${viewport.name}-settled.png`,
      animations: "disabled",
    });

    await scrollIntro(page, 1);
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
    const holdStart = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, viewport.height * 0.25);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(holdStart + viewport.height * 0.25 - 2);
    await expect(page.locator("#featured-title")).not.toBeInViewport();
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
    expect(
      await page.evaluate(() => {
        const stage = document
          .querySelector(".intro-stage")!
          .getBoundingClientRect();
        const header = document
          .querySelector(".site-header")!
          .getBoundingClientRect();
        return Math.abs(stage.top - header.bottom);
      }),
    ).toBeLessThan(2);

    await page.mouse.wheel(0, -viewport.height * 0.08);
    await expect(page.locator(".home-intro")).toHaveClass(/is-released/);
    await expect(layer).toHaveAttribute("data-phase", "settled");
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(2);
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "0");
    const avatarTop = (await page.locator(".intro-avatar").boundingBox())!.y;
    await page.mouse.wheel(0, viewport.height * 0.12);
    await expect
      .poll(
        async () =>
          avatarTop - (await page.locator(".intro-avatar").boundingBox())!.y,
      )
      .toBeGreaterThan(viewport.height * 0.1);
    await expect(layer).toHaveAttribute("data-phase", "settled");

    await page.locator("#featured-title").scrollIntoViewIfNeeded();
    await expect(page.locator("#featured-title")).toBeInViewport();
    expect(
      await page.evaluate(() => {
        const effect = document
          .querySelector(".intro-confetti")!
          .getBoundingClientRect();
        const section = document
          .querySelector(".home-section")!
          .getBoundingClientRect();
        return (
          effect.bottom <= section.top &&
          document.documentElement.scrollWidth <= innerWidth
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: `../.local/home-confetti-${viewport.name}-projects.png`,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "全部作品", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await page.locator(".brand").click();
    await expect(page.locator(".intro-confetti")).toHaveAttribute(
      "data-phase",
      "settled",
    );
    await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "0");
    await expect(page.locator(".home-intro")).toHaveClass(/is-released/);
    await page.reload();
    await expect(layer).toHaveAttribute("data-phase", "idle");
    await expect(page.locator(".terminal-scene")).toHaveCSS("opacity", "1");
    expect((await pixels(page)).count).toBe(0);
    await scrollIntro(page, 0.68);
    await expect(layer).toHaveAttribute("data-phase", "burst");
    expect(errors).toEqual([]);
  });
}

test("减少动态效果时直接展示介绍，切换设置不会补播动画", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
  await expect(page.locator(".intro-confetti")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await scrollIntro(page, 0.9);
  await expect(page.locator(".intro-confetti")).toHaveAttribute(
    "data-phase",
    "settled",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".intro-confetti")).toHaveCount(0);
  await expect(page.locator(".intro-copy")).toHaveCSS("opacity", "1");
});
