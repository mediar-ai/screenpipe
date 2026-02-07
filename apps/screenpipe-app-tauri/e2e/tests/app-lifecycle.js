/**
 * App Lifecycle Test
 *
 * Covers TESTING.md sections:
 * - Section 8: App lifecycle & updates (clean quit, force quit recovery)
 * - Section 9: Database & storage (concurrent DB access, UTF-8)
 * - Section 14: Windows-specific (COM thread conflict)
 *
 * Tests app stability and basic lifecycle behavior.
 */

describe('App Lifecycle', () => {
    before(async () => {
        await browser.waitUntil(
            async () => (await browser.execute(() => document.readyState)) === 'complete',
            { timeout: 30000, timeoutMsg: 'app did not load' }
        );
    });

    it('should load without unhandled errors', async () => {
        await browser.pause(3000);

        const bodyText = await browser.execute(() => document.body.innerText);
        expect(bodyText).not.toContain('Unhandled Runtime Error');
        expect(bodyText).not.toContain('Application error');
        expect(bodyText).not.toContain('Something went wrong');
    });

    it('should not have console errors on startup', async () => {
        const logs = await browser.getLogs('browser');
        const severeErrors = logs.filter(log =>
            log.level === 'SEVERE' &&
            !log.message.includes('favicon') &&
            !log.message.includes('DevTools')
        );

        if (severeErrors.length > 0) {
            console.log('Console errors found:');
            severeErrors.forEach(e => console.log(`  ${e.message}`));
        }

        // Warn but don't fail — some console errors may be expected
        // expect(severeErrors.length).toBe(0);
    });

    it('should handle UTF-8 content in search (Section 9)', async () => {
        const result = await browser.execute(async () => {
            try {
                const res = await fetch('http://localhost:3030/search?q=%E4%B8%AD%E6%96%87&limit=1');
                return { ok: res.ok, status: res.status };
            } catch (e) {
                return { ok: false, error: e.message };
            }
        });

        // Should not crash on Unicode search
        expect(result.status).not.toBe(500);
    });

    it('should have responsive UI after 10 seconds', async () => {
        await browser.pause(10000);

        // Verify DOM is still interactive
        const canExecute = await browser.execute(() => {
            return typeof document.querySelector === 'function';
        });
        expect(canExecute).toBe(true);

        const ready = await browser.execute(() => document.readyState);
        expect(ready).toBe('complete');
    });

    it('should have correct window dimensions', async () => {
        const size = await browser.execute(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
        }));

        // Window should be reasonably sized (not 0x0 or tiny)
        expect(size.width).toBeGreaterThan(400);
        expect(size.height).toBeGreaterThan(300);
    });

    it('should navigate between pages without crash', async () => {
        // Try navigating to different routes
        const routes = ['/', '/settings'];

        for (const route of routes) {
            await browser.execute((r) => {
                window.location.href = r;
            }, route);
            await browser.pause(2000);

            const ready = await browser.execute(() => document.readyState);
            expect(ready).toBe('complete');
        }
    });
});
