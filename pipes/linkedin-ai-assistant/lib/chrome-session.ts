import fs from 'fs/promises';
import path from 'path';
import { Page } from 'puppeteer-core';

const SESSION_FILE = path.join(process.cwd(), 'lib', 'storage', 'chrome-session.json');

export class ChromeSession {
    private static instance: ChromeSession;
    private wsUrl: string | null = null;
    private isConnected: boolean = false;
    private activePage: Page | null = null;

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
            hasActivePage: !!this.activePage
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
        this.saveState();
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
        this.saveState();
        console.log('chrome session cleared');
    }
} 