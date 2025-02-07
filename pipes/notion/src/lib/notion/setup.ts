import { chromium, Page } from "playwright";
import { NotionCredentials } from "@/lib/types";
import { INTEGRATION_NAME } from "../utils";

// Integration Name

// Button Click
async function buttonClick(page: Page, selector: string) {
	const element = page.locator(selector);
	console.log(element);
	await element?.click({ force: true });
}

// Create Table in Notion
async function createTable(page: Page, nameDB: string) {
	await page.goto("https://www.notion.so");

	await page.getByRole("button").getByLabel("New page").click();

	await page.getByRole("menu").getByText("Table").click();

	await page.click('h1[placeholder="Untitled"]');

	await page
		.locator('h1[placeholder="Untitled"]')
		.pressSequentially(` ${nameDB}`);

	await page.keyboard.press("Enter");

	await page
		.locator("div.notion-topbar")
		.locator('div[aria-label="Actions"]')
		.click();

	await page.click("text=Connections");

	await page
		.getByPlaceholder("Search for connections...")
		.fill(INTEGRATION_NAME);

	await page.click(`text=${INTEGRATION_NAME}`);

	await page.click("text=Confirm");

	await page.waitForTimeout(2000);

	const dburl = page.url().replaceAll("https://www.notion.so/", "");
	const dbId = dburl.split("-").pop()?.split("?")[0];

	return dbId;
}

// Create Integration in Notion
async function createIntegration(page: Page, workspace: string) {
	// Create integration

	await page.goto(
		"https://www.notion.so/profile/integrations/form/new-integration",
		{
			waitUntil: "domcontentloaded",
		},
	);
	await page.getByPlaceholder("Add integration name").fill(INTEGRATION_NAME);
	// await page.fill('input[id="integrationName"]', INTEGRATION_NAME);

	await page
		.locator(
			"#notion-app > div > div:nth-child(1) > div > section > section:nth-child(2) > form > div:nth-child(3) > div",
		)
		.getByRole("button", { expanded: false })
		.click();

	await page.click(`text=${workspace}`);

	await page.click("text=Save", { delay: 1000 });
	await page.waitForTimeout(2000);

	const accessToken = await getAccessToken(page);
	console.log("accessToken", accessToken);

	return accessToken;
}

async function getAccessToken(page: Page) {
	await page.goto("https://www.notion.so/profile/integrations");

	await page.click(`text=${INTEGRATION_NAME}`);

	await buttonClick(
		page,
		"#notion-app > div > div:nth-child(1) > div > section > section:nth-child(2) > main > form > div:nth-child(6) > div > div.notion-focusable-within > div > div > div:nth-child(3)",
	);

	const accessToken = await page
		.locator('input[type="text"][disabled]')
		.inputValue();

	return accessToken;
}

// switch to workspace
async function switchWorkspace(page: Page, workspace: string) {
	await page.goto("https://www.notion.so");

	const sidebar = page.locator("div.notion-sidebar-switcher");
	await sidebar.click();

	console.log(workspace, "workspace");

	const workspaceItem = page.locator(`div[role="menuitem"]`, {
		has: page.getByText(workspace),
	});

	await workspaceItem.click({ delay: 1000 });
	// await page.click(`text=${workspace}`, { delay: 1000 });
}

// const STORAGE_PATH = path.join(process.cwd(), ".notion-storage");

// Automate the process of creating integration and tables
export async function automateNotionSetup(
	workspace: string,
): Promise<NotionCredentials> {
	let loginBrowser, setupBrowser;

	try {
		//await loginUser(page, email, password);
		loginBrowser = await chromium.launch({
			headless: false,
			channel: "chrome",
			slowMo: 1000,
		});

		const loginContext = await loginBrowser.newContext({
			viewport: null,
		});

		const loginPage = await loginContext.newPage();

		await loginPage.goto("https://www.notion.so/my-integrations");
		console.log("Please log in to Notion in the browser window...");
		await loginPage.waitForURL("https://www.notion.so/profile/integrations", {
			timeout: 120000,
		});
		console.log("Login detected, proceeding with setup...");

		const authState = await loginContext.storageState();
		await loginBrowser.close();

		// Second browser instance for creation tasks
		setupBrowser = await chromium.launch({
			headless: true,
			channel: "chrome",
		});

		// Create new context with stored auth state
		const setupContext = await setupBrowser.newContext({
			viewport: null,
			storageState: authState,
		});

		const setupPage = await setupContext.newPage();

		await setupPage.goto("https://www.notion.so/my-integrations");

		await setupPage.waitForURL("https://www.notion.so/profile/integrations", {
			waitUntil: "domcontentloaded",
			timeout: 12000,
		});

		let isIntegrationPresent;

		try {
			await setupPage.locator(`text=${INTEGRATION_NAME}`).first().waitFor();

			isIntegrationPresent = await setupPage
				.locator(`text=${INTEGRATION_NAME}`)
				.first()
				.isVisible({ timeout: 1000 });
		} catch (_error) {
			isIntegrationPresent = false;
		}

		console.log(`integrations ${INTEGRATION_NAME}`, isIntegrationPresent);

		let accessToken: string;

		if (isIntegrationPresent) {
			accessToken = await getAccessToken(setupPage);
		} else {
			accessToken = await createIntegration(setupPage, workspace);
		}

		await switchWorkspace(setupPage, workspace);

		const logsDbId = await createTable(setupPage, "Activity Logs");

		const intelligenceDbId = await createTable(
			setupPage,
			"Relationship Intelligence",
		);

		await setupPage.waitForTimeout(1000);

		console.log(accessToken, logsDbId, intelligenceDbId);
		if (!accessToken || !logsDbId || !intelligenceDbId) {
			throw new Error("Failed to get credentials");
		}

		await setupPage.close();

		return {
			accessToken,
			databaseId: logsDbId,
			intelligenceDbId,
		};
	} catch (error) {
		console.log(error);
		await loginBrowser?.close();
		await setupBrowser?.close();
		throw error;
	}
}
