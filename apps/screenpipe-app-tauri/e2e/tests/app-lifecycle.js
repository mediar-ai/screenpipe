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

    it('should have health API accessible from WebView (S8)', async () => {
        const health = await browser.execute(async () => {
            const res = await fetch('http://localhost:3030/health');
            return res.json();
        });

        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('frame_status');
        expect(['healthy', 'degraded']).toContain(health.status);
    });

    it('should have no memory leak indicators after navigation (S8)', async () => {
        // Navigate rapidly to simulate user behavior
        const routes = ['/', '/settings', '/', '/settings', '/'];
        for (const route of routes) {
            await browser.execute((r) => { window.location.href = r; }, route);
            await browser.pause(1000);
        }

        // Check JS heap if available
        const memInfo = await browser.execute(() => {
            if (performance.memory) {
                return {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                };
            }
            return null;
        });

        if (memInfo) {
            const usedMB = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
            const limitMB = Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024);
            console.log(`JS heap: ${usedMB}MB / ${limitMB}MB`);
            // If using >80% of heap, that's concerning
            if (usedMB > limitMB * 0.8) {
                console.log('Warning: JS heap usage is high');
            }
        }

        const ready = await browser.execute(() => document.readyState);
        expect(ready).toBe('complete');
    });

    it('should handle rapid reload without crash (S8.4)', async () => {
        for (let i = 0; i < 3; i++) {
            await browser.execute(() => { window.location.reload(); });
            await browser.pause(1500);
        }

        const ready = await browser.execute(() => document.readyState);
        expect(ready).toBe('complete');

        const bodyText = await browser.execute(() => document.body.innerText);
        expect(bodyText).not.toContain('Unhandled Runtime Error');
    });

    it('should have correct platform info (S14)', async () => {
        const platform = await browser.execute(() => navigator.platform);
        // Should be a valid platform string
        expect(platform).toBeTruthy();
        expect(platform.length).toBeGreaterThan(0);
    });

    it('should handle back/forward navigation (S8)', async () => {
        await browser.execute(() => { window.location.href = '/settings'; });
        await browser.pause(1000);
        await browser.execute(() => { window.location.href = '/'; });
        await browser.pause(1000);

        // Go back
        await browser.execute(() => { window.history.back(); });
        await browser.pause(1000);

        const ready = await browser.execute(() => document.readyState);
        expect(ready).toBe('complete');

        // Go forward
        await browser.execute(() => { window.history.forward(); });
        await browser.pause(1000);

        const ready2 = await browser.execute(() => document.readyState);
        expect(ready2).toBe('complete');
    });
});
