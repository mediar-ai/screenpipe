const { setupBrowser } = require('../browser_setup');
const { getMessages } = require('./extract_messages');

async function testExtractMessages() {
    try {
        // Replace with your actual WebSocket URL
        const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/cfddb821-78eb-4673-90e6-057dc87dc680';
        
        const { browser, page } = await setupBrowser(wsUrl);
        console.log('connected to browser');

        // Extract messages using your existing function
        const messages = await getMessages(page);
        console.log('extracted messages:', messages);

        await browser.disconnect();
        console.log('browser disconnected');
    } catch (e) {
        console.error('test failed:', e);
    }
}

testExtractMessages();