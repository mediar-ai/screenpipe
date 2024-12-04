import { Page } from 'puppeteer-core';
import { ProfileDetails } from '../storage/types';

export async function extractProfileText(page: Page): Promise<ProfileDetails> {
    // wait for critical elements to load
    console.log('waiting for profile page to load...');
    const timeout = 3000; // reduced to 8 seconds
    
    // wait for all critical elements
    await Promise.all([
        page.waitForSelector('h1', { timeout }), // name
        page.waitForSelector('div.text-body-medium', { timeout }), // title/headline
        page.waitForSelector('.text-body-small.inline.t-black--light.break-words', { timeout }), // location
        // shorter idle time for network
        page.waitForNetworkIdle({ timeout, idleTime: 500 })
    ]).catch(err => {
        console.log('warning: some elements failed to load:', err.message);
    });
    
    console.log('profile page loaded');

    const profileText = await page.evaluate(() => {
        // Helper function to check if an element is visible
        const isVisible = (el: Element): boolean => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0';
        };

        // Helper to get clean text
        const cleanText = (text: string): string => 
            text.trim()
                .replace(/\s+/g, ' ')
                .replace(/\n+/g, '\n')
                .trim();

        // Use Set to prevent duplicates
        const seenTexts = new Set<string>();
        const textNodes: string[] = [];
        
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
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
            }
        );

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
            name: document.querySelector('h1')?.textContent?.trim(),
            title: document.querySelector('div.text-body-medium')?.textContent?.trim(),
            headline: document.querySelector('div.text-body-medium')?.textContent?.trim(),
            location: document.querySelector('.text-body-small.inline.t-black--light.break-words')?.textContent?.trim(),
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
}