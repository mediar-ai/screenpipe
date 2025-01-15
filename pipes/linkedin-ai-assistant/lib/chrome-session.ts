import { Page } from 'puppeteer-core';

// Create a new file for managing Chrome session state
export class ChromeSession {
    private static instance: ChromeSession;
    private wsUrl: string | null = null;
    private isConnected: boolean = false;
    private activePage: Page | null = null;

    private constructor() {}

    static getInstance(): ChromeSession {
        if (!ChromeSession.instance) {
            ChromeSession.instance = new ChromeSession();
        }
        return ChromeSession.instance;
    }

    setWsUrl(url: string) {
        this.wsUrl = url;
        this.isConnected = true;
    }

    getWsUrl(): string | null {
        return this.wsUrl;
    }

    setActivePage(page: Page) {
        this.activePage = page;
    }

    getActivePage(): Page | null {
        return this.activePage;
    }

    isActive(): boolean {
        return this.isConnected;
    }

    clear() {
        this.wsUrl = null;
        this.isConnected = false;
        this.activePage = null;
    }
} 