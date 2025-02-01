import fs from 'fs/promises';
import path from 'path';
import { Page, Browser } from 'puppeteer-core';

const SESSION_FILE = path.join(process.cwd(), 'lib', 'storage', 'chrome-session.json');

export class ChromeSession {
    private static instance: ChromeSession;
    private wsUrl: string | null = null;
    private isConnected: boolean = false;
    private activePage: Page | null = null;
    private activePageId: string | null = null;
    private activeBrowser: Browser | null = null;

    private constructor() {
        // Load saved state on instantiation
        this.loadState().catch(err => {
            console.log('failed to load chrome session state:', err);
        });
    }

    static getInstance(): ChromeSession {
        if (!ChromeSession.instance) {
            ChromeSession.instance = new ChromeSession();
        }
        return ChromeSession.instance;
    }

    private async saveState() {
        const state = {
            wsUrl: this.wsUrl,
            isConnected: this.isConnected,
            activePageId: this.activePageId
        };

        try {
            await fs.writeFile(SESSION_FILE, JSON.stringify(state, null, 2));
        } catch (err) {
            console.log('failed to save chrome session state:', err);
        }
    }

    private async loadState() {
        try {
            const data = await fs.readFile(SESSION_FILE, 'utf-8');
            const state = JSON.parse(data);
            this.wsUrl = state.wsUrl;
            this.isConnected = state.isConnected;
            this.activePageId = state.activePageId;
        } catch (err) {
            console.log('no saved chrome session state found');
        }
    }

    setWsUrl(url: string) {
        this.wsUrl = url;
        this.isConnected = true;
        this.saveState();
    }

    getWsUrl(): string | null {
        return this.wsUrl;
    }

    setActivePage(page: Page) {
        this.activePage = page;
        // @ts-ignore - different puppeteer versions have different Target APIs
        this.activePageId = page.target()._targetId || page.target().id() || page.target().targetId();
        this.saveState();
    }

    getActivePage(): Page | null {
        this.validateConnection().catch(() => this.clear());
        return this.activePage;
    }

    getActivePageId(): string | null {
        return this.activePageId;
    }

    isActive(): boolean {
        return this.isConnected;
    }

    clear() {
        this.wsUrl = null;
        this.isConnected = false;
        this.activePage = null;
        this.activePageId = null;
        this.saveState();
        console.log('chrome session cleared');
    }

    setActiveBrowser(browser: Browser) {
        this.activeBrowser = browser;
        this.isConnected = true;
        this.saveState();
    }

    getActiveBrowser(): Browser | null {
        this.validateConnection().catch(() => this.clear());
        return this.activeBrowser;
    }

    async validateConnection(): Promise<boolean> {
        if (!this.activeBrowser || !this.activePage) {
            return false;
        }

        try {
            // Test if browser is still connected
            const pages = await this.activeBrowser.pages();
            if (!pages.length || this.activePage.isClosed()) {
                this.clear();
                return false;
            }
            return true;
        } catch (error) {
            console.log('browser connection validation failed:', error);
            this.clear();
            return false;
        }
    }
} 