import { setupBrowser } from '../browser-setup';
import { getMessages } from './extract-messages';

async function testExtractMessages() {
    try {
        // Replace with your actual WebSocket URL
        // const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/72af91ce-8c00-4035-81bc-aa5d86846084';
        
        const { browser, page } = await setupBrowser();
        console.log('connected to browser');

        // Extract messages using your existing function
        const messages = await getMessages(page);
        console.log('extracted messages:', JSON.stringify(messages, null, 2));

        await browser.disconnect();
        console.log('browser disconnected');
    } catch (e) {
        console.error('test failed:', e);
    }
}

testExtractMessages();