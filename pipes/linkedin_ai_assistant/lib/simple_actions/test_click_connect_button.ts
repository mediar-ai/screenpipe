const { setupBrowser } = require('../browser_setup');
const { clickFirstConnectButton } = require('./click_first_connect_button');

async function testClickConnect() {
    try {
        // Replace with your actual WebSocket URL
        const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/52a359b2-8d8f-401e-b2dd-ec00f1311a25';
        
        const { browser, page } = await setupBrowser(wsUrl);
        console.log('connected to browser');

        // Test the click connect functionality
        await clickFirstConnectButton(page);
        console.log('connect button click test completed successfully');

        // Wait a bit to see the results visually
        await new Promise(r => setTimeout(r, 2000));

        await browser.disconnect();
        console.log('browser disconnected');
    } catch (e) {
        console.error('test failed:', e);
    }
}

testClickConnect(); 