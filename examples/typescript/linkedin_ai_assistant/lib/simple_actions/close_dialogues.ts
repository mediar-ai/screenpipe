import { Page } from 'puppeteer-core';
import { showClickAnimation } from './click_animation';

export async function closeAllMessageDialogues(page: Page) {
    try {
        // Wait for any dialogues to be visible
        await new Promise(r => setTimeout(r, 2000)); // wait 2 seconds for dialogues to render

        // Get all potential close buttons
        const closeButtonSelector = 'button.msg-overlay-bubble-header__control';
        const buttons = await page.$$(closeButtonSelector);

        console.log(`found ${buttons.length} potential close buttons`);

        if (buttons.length === 0) {
            console.log('no close buttons found');
            return;
        }

        let dialoguesClosed = 0;

        // Iterate over buttons and click the ones that close conversations
        for (const button of buttons) {
            const buttonText = await page.evaluate(
                (el) => el.querySelector('.artdeco-button__text')?.textContent || '',
                button
            );

            if (buttonText.includes('Close your conversation with')) {
                await showClickAnimation(page, button);
                await button.click();
                dialoguesClosed++;
                console.log(`closed a dialogue: ${buttonText.trim()}`);
            }
        }

        if (dialoguesClosed === 0) {
            console.log('no open message dialogues to close');
        } else {
            // Wait a bit for animations to complete
            await new Promise(r => setTimeout(r, 1000));

            console.log(`successfully closed ${dialoguesClosed} message dialogues`);
        }
    } catch (e) {
        console.error('error closing message dialogues:', e);
        throw e;
    }
}

// Test function
// async function main() {
//     const { setupBrowser } = await import('./browser_setup');
//     try {
//         const { browser, page } = await setupBrowser();
//         console.log('starting dialogue close test');

//         await closeAllMessageDialogues(page);

//         console.log('test completed, press ctrl+c to exit');
//         await new Promise(() => {}); // keep alive
//     } catch (e) {
//         console.error('test failed:', e);
//         process.exit(1);
//     }
// }

// if (require.main === module) {
//     main();
// }
