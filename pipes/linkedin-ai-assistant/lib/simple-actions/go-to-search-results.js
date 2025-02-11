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
exports.navigateToSearch = navigateToSearch;
function navigateToSearch(page, url, options) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('navigating to linkedin search...');
        yield page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        console.log('page loaded');
        // Check if LinkedIn requires sign-in
        const isSignInPage = yield page.evaluate(() => {
            return !!document.querySelector('.sign-in-form');
        });
        if (isSignInPage) {
            throw new Error('linkedin requires sign in');
        }
        // Wait for search results to load
        yield page.waitForSelector('.search-results-container', { timeout: 10000 })
            .catch(() => {
            console.log('search results container not found, proceeding anyway');
        });
        // Extract the results count
        const count = yield page.evaluate(() => {
            // Try to find the element that contains the results count
            const resultTextElement = document.querySelector('h2.pb2.t-black--light.t-14') ||
                document.querySelector('h2') ||
                document.querySelector('.display-flex.t-12.t-black--light.t-normal');
            if (resultTextElement) {
                const text = resultTextElement.textContent || '';
                const match = text.match(/\d+(,\d+)*/);
                if (match) {
                    return parseInt(match[0].replace(/,/g, ''), 10);
                }
            }
            return 0;
        });
        console.log(`found ${count} results`);
        if (count > 100 && !(options === null || options === void 0 ? void 0 : options.allowTruncate)) {
            throw new Error(`too many results: ${count} (limit: 100). please refine your search`);
        }
        return { count };
    });
}
