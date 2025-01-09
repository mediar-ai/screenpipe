import { setupBrowser } from '../browser-setup';
import { clickCancelConnectionRequest } from './click-cancel-connection-request';

async function testCancelRequest() {
    try {
        // Replace with your actual WebSocket URL
        const wsUrl = 'ws://127.0.0.1:9222/devtools/browser/c7192137-8d9d-42c6-afad-c3d4d35f2ee0';
        
        const { browser, page } = await setupBrowser(wsUrl);
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