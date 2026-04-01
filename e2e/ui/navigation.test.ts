import { expect, type Page, test } from "@playwright/test";

const UI_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const TOKEN = process.env.PROCELLA_DEV_AUTH_TOKEN ?? "devtoken123";

async function setDevToken(page: Page) {
	await page.goto(`${UI_URL}/`);
	await page.evaluate((token) => localStorage.setItem("procella-token", token), TOKEN);
}

test.describe("Navigation & Page Loading", () => {
	test.beforeEach(async ({ page }) => {
		await setDevToken(page);
	});

	test("home page loads without errors", async ({ page }) => {
		await page.goto(`${UI_URL}/`);
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).toBeVisible();
		// Page loaded successfully
		expect(page.url()).toContain(UI_URL);
	});

	test("settings page loads", async ({ page }) => {
		await page.goto(`${UI_URL}/settings`);
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).toBeVisible();
	});

	test("tokens page loads", async ({ page }) => {
		await page.goto(`${UI_URL}/tokens`);
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).toBeVisible();
	});

	test("webhooks page loads", async ({ page }) => {
		await page.goto(`${UI_URL}/webhooks`);
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).toBeVisible();
	});

	test("404 page for unknown route", async ({ page }) => {
		await page.goto(`${UI_URL}/this-does-not-exist-${Date.now()}`);
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).toBeVisible();
	});

	test("cli-login page loads", async ({ page }) => {
		await page.goto(`${UI_URL}/cli-login`);
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).toBeVisible();
	});

	test("direct stack detail URL loads", async ({ page }) => {
		await page.goto(`${UI_URL}/dev-org/test-project/dev`);
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).toBeVisible();
	});
});
