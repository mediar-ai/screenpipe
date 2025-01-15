import { setupBrowser } from '../browser-setup';
import { checkIfRestricted } from './check-if-restricted';
import { ChromeSession } from '../chrome-session';

async function testCheckRestriction() {
    try {
        const { browser, page } = await setupBrowser();
        console.log('connected to browser');

        // Test on a known profile URL
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle0' });
        console.log('navigated to linkedin feed');

        // Check for restrictions
        const restrictionStatus = await checkIfRestricted(page);
        
        if (restrictionStatus.isRestricted) {
            console.log('account is restricted!');
            console.log('end date:', restrictionStatus.restrictionEndDate);
            console.log('reason:', restrictionStatus.reason);
        } else {
            console.log('account is not restricted');
        }

        // Wait a bit to see the results visually
        await new Promise(r => setTimeout(r, 2000));

        await browser.disconnect();
        console.log('browser disconnected');
    } catch (e) {
        console.error('test failed:', e);
    } finally {
        // Clear the chrome session
        ChromeSession.getInstance().clear();
    }
}

testCheckRestriction(); 