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
exports.cleanProfileUrl = cleanProfileUrl;
exports.extractProfileElements = extractProfileElements;
const highlight_element_1 = require("./highlight-element");
function cleanProfileUrl(url) {
    return url.split('?')[0];
}
function extractProfileElements(page, options) {
    return __awaiter(this, void 0, void 0, function* () {
        let allProfiles = [];
        let hasNextPage = true;
        let pageNum = 1;
        const maxProfiles = (options === null || options === void 0 ? void 0 : options.maxProfiles) || Infinity;
        while (hasNextPage && allProfiles.length < maxProfiles) {
            console.log(`\n=== Extracting profiles from page ${pageNum} ===\n`);
            // wait for profiles to load
            console.log('waiting for profiles to load...');
            yield page.waitForSelector('span.visually-hidden');
            console.log('profiles loaded');
            // extract profiles from current page
            console.log('extracting profiles...');
            const spans = yield page.$$('span.visually-hidden');
            const profileElements = [];
            for (const span of spans) {
                const isProfile = yield page.evaluate(el => { var _a; return (_a = el.textContent) === null || _a === void 0 ? void 0 : _a.includes('profile'); }, span);
                if (isProfile) {
                    yield (0, highlight_element_1.highlightElement)(page, span);
                    const profileData = yield page.evaluate(span => {
                        var _a;
                        const link = span.closest('a');
                        return {
                            text: (_a = span.textContent) === null || _a === void 0 ? void 0 : _a.trim(),
                            href: link ? link.href : null,
                            class: span.className,
                            parentClass: (link === null || link === void 0 ? void 0 : link.className) || null,
                            isClickable: !!link
                        };
                    }, span);
                    profileElements.push(profileData);
                }
            }
            // clean and add current page profiles
            const cleanedElements = profileElements.map(el => (Object.assign(Object.assign({}, el), { href: el.href ? cleanProfileUrl(el.href) : null })));
            // Only add profiles up to the max limit
            const remainingSlots = maxProfiles - allProfiles.length;
            const elementsToAdd = cleanedElements.slice(0, remainingSlots);
            allProfiles = [...allProfiles, ...elementsToAdd];
            // log current page profiles
            console.log(`Found ${elementsToAdd.length} profiles on page ${pageNum}`);
            elementsToAdd.forEach((profile, index) => {
                console.log(`${index + 1}: ${profile.text}, ${profile.href}`);
            });
            // Stop if we've reached the max profiles
            if (allProfiles.length >= maxProfiles) {
                console.log(`reached maximum of ${maxProfiles} profiles, stopping extraction`);
                break;
            }
            // check for next page button and click if exists
            hasNextPage = yield page.evaluate(() => {
                const nextButton = document.querySelector('button.artdeco-pagination__button--next');
                return nextButton !== null && !nextButton.hasAttribute('disabled');
            });
            if (hasNextPage) {
                try {
                    const nextButton = yield page.$('button.artdeco-pagination__button--next');
                    if (nextButton) {
                        yield (0, highlight_element_1.highlightElement)(page, nextButton);
                    }
                    console.log('clicking next page...');
                    yield page.click('button.artdeco-pagination__button--next');
                    console.log('button clicked');
                    // wait for any of these conditions that indicate page load
                    yield Promise.race([
                        // wait for new results to appear
                        page.waitForSelector('span.visually-hidden', { timeout: 10000 }),
                        // or wait for search-results container update
                        page.waitForFunction(() => {
                            const results = document.querySelector('.search-results-container');
                            return results && !results.getAttribute('aria-busy');
                        }, { timeout: 10000 }),
                    ]);
                    console.log('page loaded');
                    // wait a bit to ensure content is stable
                    console.log('waiting 2s before next extraction...');
                    yield new Promise(resolve => setTimeout(resolve, 2000));
                    pageNum++;
                    console.log(`moved to page ${pageNum}`);
                }
                catch (e) {
                    console.error('failed to navigate to next page:', e);
                    hasNextPage = false;
                }
            }
        }
        console.log(`\n=== Total profiles found across ${pageNum} pages: ${allProfiles.length} ===\n`);
        return allProfiles;
    });
}
