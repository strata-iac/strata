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

async function updateEscEnvironment(project: string, name: string, yamlBody: string) {
	const res = await fetch(
		`${API_URL}/api/esc/environments/dev-org/${encodeURIComponent(project)}/${encodeURIComponent(name)}`,
		{
			method: "PATCH",
			headers: ESC_HEADERS,
			body: JSON.stringify({ yamlBody }),
		},
	);
	if (!res.ok) throw new Error(`Update env failed: ${res.status} ${await res.text()}`);
	return res.json();
}

test.describe("ESC Revision Diff", () => {
	const ts = Date.now();
	const project = `pw-diff-${ts}`;
	const envName = `dev-${ts}`;

	test.beforeAll(async () => {
		await createEscEnvironment(project, envName, "values:\n  key: original\n");
		await updateEscEnvironment(project, envName, "values:\n  key: modified\n  extra: added\n");
	});

	test.beforeEach(async ({ page }) => {
		await setDevToken(page);
	});

	test("Compare button shows diff between revision and current", async ({ page }) => {
		await page.goto(`${UI_URL}/esc/${project}/${envName}`);
		await expect(page.getByText("rev #2")).toBeVisible({ timeout: 10_000 });

		const compareBtn = page.getByRole("button", { name: "Compare" });
		await expect(compareBtn).toBeVisible({ timeout: 5_000 });
		await compareBtn.first().click();

		await expect(page.getByText("Revision #1")).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText("Current")).toBeVisible();
	});

	test("Close button hides diff panel", async ({ page }) => {
		await page.goto(`${UI_URL}/esc/${project}/${envName}`);
		await expect(page.getByText("rev #2")).toBeVisible({ timeout: 10_000 });

		await page.getByRole("button", { name: "Compare" }).first().click();
		await expect(page.getByText("Revision #1")).toBeVisible({ timeout: 5_000 });

		await page.getByRole("button", { name: /Close/ }).click();
		await expect(page.getByText("Revision #1")).not.toBeVisible();
	});
});
