describe('Project', () => {
	it('Health check', async () => {
		// Wait for app to load
		await browser.waitUntil(
			async () => {
				const readyState = await browser.execute(() => document.readyState);
				return readyState === 'complete';
			},
			{
				timeout: 10000,
				timeoutMsg: 'app did not load in time'
			}
		);

		// Click skip onboarding button
		const button = await $('button.text-muted-foreground*=skip onboarding');
		await button.isClickable();
		await button.click();

		// Close the dialog
		const dialogCloseButton = await $('button.absolute.right-4.top-4 svg.lucide-x');
		await dialogCloseButton.isClickable();
		await dialogCloseButton.click();

		// Click badge
		const badge = await $('div.cursor-pointer.bg-transparent');
		await badge.isClickable();
		await badge.click();

		// Wait until the status message is correct
		await browser.waitUntil(
			async () => {
				const statusElement = await $('div.flex-grow p.text-sm');
				const statusMessage = await statusElement.getText();
				return statusMessage.includes('screenpipe is running smoothly');
			},
			{
				timeout: 60000, // maximum wait time (e.g., 1 minute)
				timeoutMsg: 'status message did not update in time'
			}
		);

		// Verify the status message
		const statusElement = await $('div.flex-grow p.text-sm');
		const statusMessage = await statusElement.getText();
		expect(statusMessage).toContain('screenpipe is running smoothly');
	});
});
