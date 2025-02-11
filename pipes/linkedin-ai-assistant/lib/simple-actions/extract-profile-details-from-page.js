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
exports.extractProfileText = extractProfileText;
function extractProfileText(page) {
    return __awaiter(this, void 0, void 0, function* () {
        // wait for critical elements to load
        console.log('waiting for profile page to load...');
        const timeout = 3000; // reduced to 8 seconds
        // wait for all critical elements
        yield Promise.all([
            page.waitForSelector('h1', { timeout }), // name
            page.waitForSelector('div.text-body-medium', { timeout }), // title/headline
            page.waitForSelector('.text-body-small.inline.t-black--light.break-words', { timeout }), // location
            // shorter idle time for network
            page.waitForNetworkIdle({ timeout, idleTime: 500 })
        ]).catch(err => {
            console.log('warning: some elements failed to load:', err.message);
        });
        console.log('profile page loaded');
        const profileText = yield page.evaluate(() => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            // Helper function to check if an element is visible
            const isVisible = (el) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0';
            };
            // Helper to get clean text
            const cleanText = (text) => text.trim()
                .replace(/\s+/g, ' ')
                .replace(/\n+/g, '\n')
                .trim();
            // Use Set to prevent duplicates
            const seenTexts = new Set();
            const textNodes = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    const parent = node.parentElement;
                    if (!parent || !isVisible(parent)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Skip if it's empty or just whitespace
                    const text = cleanText(node.textContent || '');
                    if (!text || text.length === 0) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Skip script and style contents
                    if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Skip if we've seen this exact text before
                    if (seenTexts.has(text)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let node;
            while (node = walker.nextNode()) {
                const text = cleanText(node.textContent || '');
                if (text) {
                    seenTexts.add(text);
                    textNodes.push(text);
                }
            }
            // Get specific sections
            const sections = {
                name: (_b = (_a = document.querySelector('h1')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim(),
                title: (_d = (_c = document.querySelector('div.text-body-medium')) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim(),
                headline: (_f = (_e = document.querySelector('div.text-body-medium')) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim(),
                location: (_h = (_g = document.querySelector('.text-body-small.inline.t-black--light.break-words')) === null || _g === void 0 ? void 0 : _g.textContent) === null || _h === void 0 ? void 0 : _h.trim(),
            };
            return {
                name: sections.name,
                title: sections.title,
                headline: sections.headline,
                location: sections.location,
                allText: textNodes,
            };
        });
        return profileText;
    });
}
