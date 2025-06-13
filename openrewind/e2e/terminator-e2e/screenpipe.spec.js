const { DesktopUseClient, ApiError} = require('desktop-use');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Screenpipe App Health Status', function() {
  this.timeout(150000); // Models download can take a while

  let client;

  before(() => {
    client = new DesktopUseClient();
  });

  it('should open Screenpipe and verify health status', async () => {
    try {

      const mainWindow = client.locator('window:Screenpipe');
      const rootWebArea = mainWindow.locator('role:Document');

      const skipOnboarding = rootWebArea.locator('Name:skip onboarding');
      await skipOnboarding.click();
      await delay(3000);

      const closeChangelogs = rootWebArea.locator('Name:Close');
      await closeChangelogs.click();
      await delay(3000);

      // const healthMenu = rootWebArea.locator('classname:inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground');
      const healthMenu = rootWebArea.locator('Name:health-status-badge');
      await healthMenu.click();
      await delay(3000);

      async function getHealthStatusText() {
        // const textGroup = rootWebArea.locator('Name:text-sm mb-4 font-semibold');
        const textGroup = rootWebArea.locator('Name:status-message-text');
        const text_element = textGroup.locator('role:Text');
        const attributes = await text_element.getAttributes();
        return attributes.properties?.Name || '';
      }

      const desiredText = 'STRING(screenpipe is running smoothly)';
      let healthStatusText = null;
      for (let i = 0; i < 30; i++) { // Try for up to 30 seconds
        healthStatusText = await getHealthStatusText();
        if (healthStatusText === desiredText) {
          console.log(healthStatusText);
          break;
        }
        await delay(1000);
      }

      if (healthStatusText !== desiredText) {
        throw new Error(`Health status did not match. Got: ${healthStatusText}`);
      }

    } catch (e) {
      if (e instanceof ApiError) {
        throw new Error(`API Status: ${e}`);
      } else {
        throw new Error(`Unexpected error: ${e}`);
      }
    }
  });
});
