import { expect, type Page, test } from "@playwright/test";

const UI_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:18080";
const TOKEN = process.env.PROCELLA_DEV_AUTH_TOKEN ?? "devtoken123";

const ESC_HEADERS = {
	Authorization: `token ${TOKEN}`,
	Accept: "application/vnd.pulumi+8",
	"Content-Type": "application/json",
};

async function setDevToken(page: Page) {
	await page.goto(`${UI_URL}/`);
	await page.evaluate((token) => localStorage.setItem("procella-token", token), TOKEN);
}

async function createEscEnvironment(project: string, name: string, yamlBody: string) {
	const res = await fetch(`${API_URL}/api/esc/environments/dev-org/${project}`, {
		method: "POST",
		headers: ESC_HEADERS,
		body: JSON.stringify({ name, yamlBody }),
	});
	if (!res.ok) throw new Error(`Create env failed: ${res.status} ${await res.text()}`);
	return res.json();
}

test.describe("ESC Environments List", () => {
	test.beforeEach(async ({ page }) => {
		await setDevToken(page);
	});

	test("page loads and shows empty state", async ({ page }) => {
		await page.goto(`${UI_URL}/esc`);
		await page.waitForLoadState("domcontentloaded");
		await expect(page.getByText("Environments")).toBeVisible();
	});

	test("shows environment after API creation", async ({ page }) => {
		const ts = Date.now();
		await createEscEnvironment(`pw-list-${ts}`, `dev-${ts}`, "values:\n  greeting: hello\n");
		await page.goto(`${UI_URL}/esc`);
		await expect(page.getByText(`dev-${ts}`)).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText(`pw-list-${ts}`)).toBeVisible();
	});

	test("row click navigates to detail page", async ({ page }) => {
		const ts = Date.now();
		const project = `pw-nav-${ts}`;
		const envName = `staging-${ts}`;
		await createEscEnvironment(project, envName, "values:\n  key: val\n");
		await page.goto(`${UI_URL}/esc`);
		await page.getByText(envName).click({ timeout: 10_000 });
		await page.waitForURL(`**/esc/${project}/${envName}`);
	});
});
