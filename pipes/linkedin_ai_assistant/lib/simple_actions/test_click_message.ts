const { setupBrowser } = require('../browser_setup');
const { clickFirstMessageButton } = require('./click_message');

async function testClickMessage() {
    try {
        // Replace with your actual WebSocket URL
        const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/1f237598-603c-4e61-8fc1-f8a91a3340a7';
        
        const { browser, page } = await setupBrowser(wsUrl);
        console.log('connected to browser');

        // Test the click message functionality
        await clickFirstMessageButton(page);
        console.log('message button click test completed successfully');

        // Wait a bit to see the results visually
        await new Promise(r => setTimeout(r, 2000));

        await browser.disconnect();
        console.log('browser disconnected');
    } catch (e) {
        console.error('test failed:', e);
    }
}

testClickMessage();