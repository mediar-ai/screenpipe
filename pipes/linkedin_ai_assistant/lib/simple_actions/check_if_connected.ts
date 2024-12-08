import { Page } from 'puppeteer-core';

export async function checkIfConnected(page: Page): Promise<boolean> {
    // Look for both Connect and Message buttons
    const buttons = await page.$$('button');
    
    for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent?.trim());
        if (text === 'Connect') {
            console.log('found connect button, not connected');
            return false;
        }
        if (text?.includes('Message')) {
            console.log('found message button, already connected'); 
            return true;
        }
    }

    // If neither button is found, log warning and assume not connected
    console.log('warning: could not determine connection status, assuming not connected');
    return false;
}

// usage example with click_message:
/*
async function handleProfile(page: Page) {
    const isConnected = await checkIfConnected(page);
    
    if (!isConnected) {
        console.log('skipping profile - not connected');
        return;
    }
    
    await clickFirstMessageButton(page);
}
*/
