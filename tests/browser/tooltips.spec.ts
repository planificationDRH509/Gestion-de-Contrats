import { test, expect, type Page } from "@playwright/test";

async function expectAboveInterface(page: Page, selector = '[role="tooltip"]') {
  const panel = page.locator(selector);
  await expect(panel).toBeVisible();
  const bounds = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 7);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 7);
  expect(await panel.evaluate(element => {
    const panel = element as HTMLElement;
    const original = panel.style.pointerEvents;
    panel.style.pointerEvents = "auto";
    const rect = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    panel.style.pointerEvents = original;
    return element.contains(hit);
  })).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("http://127.0.0.1:5179/tests/browser/tooltips.html");
});

test("contract and sidebar tooltips escape clipping and higher stacked siblings", async ({ page }) => {
  await page.locator("#contract").hover();
  await expectAboveInterface(page);
  await expect(page.getByRole("tooltip")).toHaveText("Sexe: Femme · Durée: 6 mois");
  await page.screenshot({ path: "/tmp/contribution-tooltip-contract.png" });
  await page.mouse.move(900, 250);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.locator("#nav").hover();
  await expectAboveInterface(page);
  const nav = (await page.locator("#nav").boundingBox())!;
  expect((await page.getByRole("tooltip").boundingBox())!.x).toBeGreaterThanOrEqual(nav.x + nav.width + 8);
  await page.screenshot({ path: "/tmp/contribution-tooltip-sidebar.png" });
});

test("keyboard, viewport edges, Escape and removed triggers", async ({ page }) => {
  await page.locator("#contract").focus();
  await expectAboveInterface(page);
  await expect(page.locator("#contract")).toHaveAttribute("aria-describedby", /existing-description .+/);
  await page.locator("#contract").evaluate(element => element.setAttribute("data-tooltip", "Durée: 12 mois"));
  await expect(page.getByRole("tooltip")).toHaveText("Durée: 12 mois");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.locator("#contract")).toHaveAttribute("aria-describedby", "existing-description");
  await page.locator("#edge").focus();
  await expectAboveInterface(page);
  await page.setViewportSize({ width: 375, height: 500 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.locator("#edge").blur();
  await page.locator("#edge").focus();
  await expectAboveInterface(page);
  await page.locator("#edge").evaluate(element => element.remove());
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("tooltips appear above a native modal dialog", async ({ page }) => {
  await page.locator("#modal").evaluate(element => (element as HTMLDialogElement).showModal());
  await page.locator("#modal-trigger").hover();
  await expectAboveInterface(page);
  await page.screenshot({ path: "/tmp/contribution-tooltip-dialog.png" });
});

test("sync details escape the contract card and remain interactive", async ({ page }) => {
  await page.getByRole("button", { name: "Sur cet appareil" }).click();
  await expectAboveInterface(page, ".contract-sync-details");
  await expect(page.getByRole("status")).toContainText("Sur cet appareil");
  await page.screenshot({ path: "/tmp/contribution-tooltip-sync.png" });
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Sur cet appareil" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sur cet appareil" })).toBeFocused();
});

test("chart tooltips escape their cards and follow chart coordinates", async ({ page }) => {
  await page.locator(".recharts-bar-rectangle").last().hover();
  await expectAboveInterface(page);
  await expect(page.getByRole("tooltip")).toHaveText("Graphique : 10");
  const panel = (await page.getByRole("tooltip").boundingBox())!;
  expect(panel.y + panel.height).toBeGreaterThan(510);
  await page.screenshot({ path: "/tmp/contribution-tooltip-chart.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.locator(".recharts-bar-rectangle").first().hover();
  await expectAboveInterface(page);
  await expect(page.getByRole("tooltip")).toHaveText("Graphique : 20");
});

test("fixed positioning also works without the Popover API", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "showPopover", { value: undefined, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", { value: undefined, configurable: true });
  });
  await page.reload();
  await page.locator("#contract").hover();
  await expectAboveInterface(page);
});
