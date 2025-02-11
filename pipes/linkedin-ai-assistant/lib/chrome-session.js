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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChromeSession = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const SESSION_FILE = path_1.default.join(process.cwd(), 'lib', 'storage', 'chrome-session.json');
class ChromeSession {
    constructor() {
        this.wsUrl = null;
        this.isConnected = false;
        this.activePage = null;
        this.activePageId = null;
        this.activeBrowser = null;
        // Load saved state on instantiation
        this.loadState().catch(err => {
            console.log('failed to load chrome session state:', err);
        });
    }
    static getInstance() {
        if (!ChromeSession.instance) {
            ChromeSession.instance = new ChromeSession();
        }
        return ChromeSession.instance;
    }
    saveState() {
        return __awaiter(this, void 0, void 0, function* () {
            const state = {
                wsUrl: this.wsUrl,
                isConnected: this.isConnected,
                activePageId: this.activePageId
            };
            try {
                yield promises_1.default.writeFile(SESSION_FILE, JSON.stringify(state, null, 2));
            }
            catch (err) {
                console.log('failed to save chrome session state:', err);
            }
        });
    }
    loadState() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = yield promises_1.default.readFile(SESSION_FILE, 'utf-8');
                const state = JSON.parse(data);
                this.wsUrl = state.wsUrl;
                this.isConnected = state.isConnected;
                this.activePageId = state.activePageId;
            }
            catch (err) {
                console.log('no saved chrome session state found');
            }
        });
    }
    setWsUrl(url) {
        this.wsUrl = url;
        this.isConnected = true;
        this.saveState();
    }
    getWsUrl() {
        return this.wsUrl;
    }
    setActivePage(page) {
        this.activePage = page;
        // @ts-ignore - different puppeteer versions have different Target APIs
        this.activePageId = page.target()._targetId || page.target().id() || page.target().targetId();
        this.saveState();
    }
    getActivePage() {
        this.validateConnection().catch(() => this.clear());
        return this.activePage;
    }
    getActivePageId() {
        return this.activePageId;
    }
    isActive() {
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
    setActiveBrowser(browser) {
        this.activeBrowser = browser;
        this.isConnected = true;
        this.saveState();
    }
    getActiveBrowser() {
        this.validateConnection().catch(() => this.clear());
        return this.activeBrowser;
    }
    validateConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.activeBrowser || !this.activePage) {
                return false;
            }
            try {
                // Test if browser is still connected
                const pages = yield this.activeBrowser.pages();
                if (!pages.length || this.activePage.isClosed()) {
                    this.clear();
                    return false;
                }
                return true;
            }
            catch (error) {
                console.log('browser connection validation failed:', error);
                this.clear();
                return false;
            }
        });
    }
}
exports.ChromeSession = ChromeSession;
