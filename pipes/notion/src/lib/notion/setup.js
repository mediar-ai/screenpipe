"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.automateNotionSetup = automateNotionSetup;
const playwright_1 = require("playwright");
const utils_1 = require("../utils");
// Integration Name
// Button Click
function buttonClick(page, selector) {
    return __awaiter(this, void 0, void 0, function* () {
        const element = page.locator(selector);
        console.log(element);
        yield (element === null || element === void 0 ? void 0 : element.click({ force: true }));
    });
}
// Create Table in Notion
function createTable(page, nameDB) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        yield page.goto("https://www.notion.so");
        yield page.getByRole("button").getByLabel("New page").click();
        yield page.getByRole("menu").getByText("Table").click();
        yield page.click('h1[placeholder="Untitled"]');
        yield page
            .locator('h1[placeholder="Untitled"]')
            .pressSequentially(` ${nameDB}`);
        yield page.keyboard.press("Enter");
        yield page
            .locator("div.notion-topbar")
            .locator('div[aria-label="Actions"]')
            .click();
        yield page.click("text=Connections");
        yield page
            .getByPlaceholder("Search for connections...")
            .fill(utils_1.INTEGRATION_NAME);
        yield page.click(`text=${utils_1.INTEGRATION_NAME}`);
        yield page.click("text=Confirm");
        yield page.waitForTimeout(2000);
        const dburl = page.url().replaceAll("https://www.notion.so/", "");
        const dbId = (_a = dburl.split("-").pop()) === null || _a === void 0 ? void 0 : _a.split("?")[0];
        return dbId;
    });
}
// Create Integration in Notion
function createIntegration(page, workspace) {
    return __awaiter(this, void 0, void 0, function* () {
        // Create integration
        yield page.goto("https://www.notion.so/profile/integrations/form/new-integration", {
            waitUntil: "domcontentloaded",
        });
        yield page.getByPlaceholder("Add integration name").fill(utils_1.INTEGRATION_NAME);
        // await page.fill('input[id="integrationName"]', INTEGRATION_NAME);
        yield page
            .locator("#notion-app > div > div:nth-child(1) > div > section > section:nth-child(2) > form > div:nth-child(3) > div")
            .getByRole("button", { expanded: false })
            .click();
        yield page.click(`text=${workspace}`);
        yield page.click("text=Save", { delay: 1000 });
        yield page.waitForTimeout(2000);
        const accessToken = yield getAccessToken(page);
        console.log("accessToken", accessToken);
        return accessToken;
    });
}
function getAccessToken(page) {
    return __awaiter(this, void 0, void 0, function* () {
        yield page.goto("https://www.notion.so/profile/integrations");
        yield page.click(`text=${utils_1.INTEGRATION_NAME}`);
        yield buttonClick(page, "#notion-app > div > div:nth-child(1) > div > section > section:nth-child(2) > main > form > div:nth-child(6) > div > div.notion-focusable-within > div > div > div:nth-child(3)");
        const accessToken = yield page
            .locator('input[type="text"][disabled]')
            .inputValue();
        return accessToken;
    });
}
// switch to workspace
function switchWorkspace(page, workspace) {
    return __awaiter(this, void 0, void 0, function* () {
        yield page.goto("https://www.notion.so");
        const sidebar = page.locator("div.notion-sidebar-switcher");
        yield sidebar.click();
        console.log(workspace, "workspace");
        const workspaceItem = page.locator(`div[role="menuitem"]`, {
            has: page.getByText(workspace),
        });
        yield workspaceItem.click({ delay: 1000 });
        // await page.click(`text=${workspace}`, { delay: 1000 });
    });
}
// const STORAGE_PATH = path.join(process.cwd(), ".notion-storage");
// Automate the process of creating integration and tables
function automateNotionSetup(workspace) {
    return __awaiter(this, void 0, void 0, function* () {
        let loginBrowser, setupBrowser;
        try {
            //await loginUser(page, email, password);
            loginBrowser = yield playwright_1.chromium.launch({
                headless: false,
                channel: "chrome",
                slowMo: 1000,
            });
            const loginContext = yield loginBrowser.newContext({
                viewport: null,
            });
            const loginPage = yield loginContext.newPage();
            yield loginPage.goto("https://www.notion.so/my-integrations");
            console.log("Please log in to Notion in the browser window...");
            yield loginPage.waitForURL("https://www.notion.so/profile/integrations", {
                timeout: 120000,
            });
            console.log("Login detected, proceeding with setup...");
            const authState = yield loginContext.storageState();
            yield loginBrowser.close();
            // Second browser instance for creation tasks
            setupBrowser = yield playwright_1.chromium.launch({
                headless: true,
                channel: "chrome",
            });
            // Create new context with stored auth state
            const setupContext = yield setupBrowser.newContext({
                viewport: null,
                storageState: authState,
            });
            const setupPage = yield setupContext.newPage();
            yield setupPage.goto("https://www.notion.so/my-integrations");
            yield setupPage.waitForURL("https://www.notion.so/profile/integrations", {
                waitUntil: "domcontentloaded",
                timeout: 12000,
            });
            let isIntegrationPresent;
            try {
                yield setupPage.locator(`text=${utils_1.INTEGRATION_NAME}`).first().waitFor();
                isIntegrationPresent = yield setupPage
                    .locator(`text=${utils_1.INTEGRATION_NAME}`)
                    .first()
                    .isVisible({ timeout: 1000 });
            }
            catch (_error) {
                isIntegrationPresent = false;
            }
            console.log(`integrations ${utils_1.INTEGRATION_NAME}`, isIntegrationPresent);
            let accessToken;
            if (isIntegrationPresent) {
                accessToken = yield getAccessToken(setupPage);
            }
            else {
                accessToken = yield createIntegration(setupPage, workspace);
            }
            yield switchWorkspace(setupPage, workspace);
            const logsDbId = yield createTable(setupPage, "Activity Logs");
            const intelligenceDbId = yield createTable(setupPage, "Relationship Intelligence");
            yield setupPage.waitForTimeout(1000);
            console.log(accessToken, logsDbId, intelligenceDbId);
            if (!accessToken || !logsDbId || !intelligenceDbId) {
                throw new Error("Failed to get credentials");
            }
            yield setupPage.close();
            return {
                accessToken,
                databaseId: logsDbId,
                intelligenceDbId,
            };
        }
        catch (error) {
            console.log(error);
            yield (loginBrowser === null || loginBrowser === void 0 ? void 0 : loginBrowser.close());
            yield (setupBrowser === null || setupBrowser === void 0 ? void 0 : setupBrowser.close());
            throw error;
        }
    });
}
