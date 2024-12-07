import { Page } from 'puppeteer-core';
import { ProfileElement } from '../storage/types';
import { highlightElement } from './highlight_element';

export function cleanProfileUrl(url: string): string {
    return url.split('?')[0];
}

export async function extractProfileElements(page: Page, options?: { maxProfiles?: number }): Promise<ProfileElement[]> {
    let allProfiles: ProfileElement[] = [];
    let hasNextPage = true;
    let pageNum = 1;
    const maxProfiles = options?.maxProfiles || Infinity;

    while (hasNextPage && allProfiles.length < maxProfiles) {
        console.log(`\n=== Extracting profiles from page ${pageNum} ===\n`);
        
        // wait for profiles to load
        console.log('waiting for profiles to load...');
        await page.waitForSelector('span.visually-hidden');
        console.log('profiles loaded');
        
        // extract profiles from current page
        console.log('extracting profiles...');
        const spans = await page.$$('span.visually-hidden');
        const profileElements = [];

        for (const span of spans) {
            const isProfile = await page.evaluate(
                el => el.textContent?.includes('profile'),
                span
            );

            if (isProfile) {
                await highlightElement(page, span);
                const profileData = await page.evaluate(span => {
                    const link = span.closest('a');
                    return {
                        text: span.textContent?.trim(),
                        href: link ? (link as HTMLAnchorElement).href : null,
                        class: span.className,
                        parentClass: link?.className || null,
                        isClickable: !!link
                    };
                }, span);
                profileElements.push(profileData);
            }
        }

        // clean and add current page profiles
        const cleanedElements = profileElements.map(el => ({
            ...el,
            href: el.href ? cleanProfileUrl(el.href) : null
        }));

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
        hasNextPage = await page.evaluate(() => {
            const nextButton = document.querySelector('button.artdeco-pagination__button--next');
            return nextButton !== null && !nextButton.hasAttribute('disabled');
        });

        if (hasNextPage) {
            try {
                const nextButton = await page.$('button.artdeco-pagination__button--next');
                if (nextButton) {
                    await highlightElement(page, nextButton);
                }
                
                console.log('clicking next page...');
                await page.click('button.artdeco-pagination__button--next');
                console.log('button clicked');

                // wait for any of these conditions that indicate page load
                await Promise.race([
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
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                pageNum++;
                console.log(`moved to page ${pageNum}`);
            } catch (e) {
                console.error('failed to navigate to next page:', e);
                hasNextPage = false;
            }
        }
    }

    console.log(`\n=== Total profiles found across ${pageNum} pages: ${allProfiles.length} ===\n`);
    return allProfiles;
}