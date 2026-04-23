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

test.describe("ESC Resolved Values", () => {
	const ts = Date.now();
	const project = `pw-values-${ts}`;
	const envName = `dev-${ts}`;

	test.beforeAll(async () => {
		await createEscEnvironment(
			project,
			envName,
			'values:\n  greeting: hello\n  secret_val:\n    fn::secret: "s3cret"\n',
		);
	});

	test.beforeEach(async ({ page }) => {
		await setDevToken(page);
	});

	test("Open Session shows resolved values with masked secrets", async ({ page }) => {
		await page.goto(`${UI_URL}/esc/${project}/${envName}`);
		await expect(page.getByText("rev #1")).toBeVisible({ timeout: 10_000 });

		await page.getByRole("button", { name: "Resolved Values" }).click();
		await page.getByRole("button", { name: "Open Session" }).click();

		await expect(page.getByText("Session")).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText("greeting")).toBeVisible();
		await expect(page.getByText('"hello"')).toBeVisible();

		await expect(page.getByText("••••••••")).toBeVisible();
	});

	test("Reveal secret shows confirmation then value", async ({ page }) => {
		await page.goto(`${UI_URL}/esc/${project}/${envName}`);
		await expect(page.getByText("rev #1")).toBeVisible({ timeout: 10_000 });

		await page.getByRole("button", { name: "Resolved Values" }).click();
		await page.getByRole("button", { name: "Open Session" }).click();
		await expect(page.getByText("••••••••")).toBeVisible({ timeout: 10_000 });

		await page.getByRole("button", { name: "Reveal" }).click();
		await expect(page.getByText("Reveal secret")).toBeVisible();

		await page.getByRole("button", { name: "Confirm" }).click();
		await expect(page.getByText("••••••••")).not.toBeVisible();
	});
});
