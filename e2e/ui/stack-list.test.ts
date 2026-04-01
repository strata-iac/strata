import { expect, type Page, test } from "@playwright/test";

const UI_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:18080";
const TOKEN = process.env.PROCELLA_DEV_AUTH_TOKEN ?? "devtoken123";
const AUTH_HEADER = { Authorization: `token ${TOKEN}`, Accept: "application/vnd.pulumi+8" };

async function setDevToken(page: Page) {
	await page.goto(`${UI_URL}/`);
	await page.evaluate((token) => localStorage.setItem("procella-token", token), TOKEN);
}

async function createStack(org: string, project: string, stack: string) {
	const res = await fetch(`${API_URL}/api/stacks/${org}/${project}/${stack}`, {
		method: "POST",
		headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
	if (!res.ok) throw new Error(`createStack failed: ${res.status}`);
}

test.describe("Stack List Page", () => {
	test.beforeEach(async ({ page }) => {
		await setDevToken(page);
	});

	test("loads the stack list page", async ({ page }) => {
		await page.goto(`${UI_URL}/`);
		await page.waitForLoadState("networkidle");
		// The page should render without errors
		await expect(page.locator("body")).toBeVisible();
	});

	test("displays stacks after creation", async ({ page }) => {
		const stackName = `pw-list-${Date.now()}`;
		await createStack("dev-org", "test-project", stackName);

		await page.goto(`${UI_URL}/`);
		await page.waitForLoadState("networkidle");

		// Wait for stack list to load and show content
		await page.waitForTimeout(1000);
		const body = await page.textContent("body");
		expect(body).toContain(stackName);
	});

	test("navigates to stack detail when clicking a stack", async ({ page }) => {
		const stackName = `pw-nav-${Date.now()}`;
		await createStack("dev-org", "test-project", stackName);

		await page.goto(`${UI_URL}/`);
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(1000);

		// Wait for and click the stack link
		const stackLink = page.getByText(stackName).first();
		await expect(stackLink).toBeVisible({ timeout: 5000 });
		await stackLink.click();
		await page.waitForLoadState("networkidle");
		expect(page.url()).toContain(stackName);
	});
});
