import { setupBrowser } from '../browser-setup';
import { clickCancelConnectionRequest } from './click-cancel-connection-request';

async function testCancelRequest() {
    try {
        // Replace with your actual WebSocket URL
        // const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/eb8cd29f-cf02-43c1-a4f7-6368bd6c25de';
        
        const { browser, page } = await setupBrowser();
        console.log('connected to browser');

        // Test the cancel request functionality
        const result = await clickCancelConnectionRequest(page);
        console.log('cancel request test result:', result);

        // Wait a bit to see the results visually
        await new Promise(r => setTimeout(r, 2000));

        await browser.disconnect();
        console.log('browser disconnected');
    } catch (e) {
        console.error('test failed:', e);
    }
}

testCancelRequest(); 


// visit http://localhost:9222/json/version to get websocket url code