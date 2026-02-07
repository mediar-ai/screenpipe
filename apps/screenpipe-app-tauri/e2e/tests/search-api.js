/**
 * Search & API Integration Test
 *
 * Covers TESTING.md sections:
 * - Section 5: Frame comparison & OCR pipeline
 * - Section 9: Database & storage
 * - Section 12: Timeline & search
 *
 * Tests the REST API and search functionality end-to-end.
 * These tests run inside the WebView2 context using fetch().
 */

describe('Search & API', () => {
    const API_BASE = 'http://localhost:3030';

    before(async () => {
        await browser.waitUntil(
            async () => (await browser.execute(() => document.readyState)) === 'complete',
            { timeout: 30000, timeoutMsg: 'app did not load' }
        );

        // Skip onboarding
        try {
            const skipBtn = await $('button*=skip');
            if (await skipBtn.isDisplayed()) {
                await skipBtn.click();
                await browser.pause(500);
            }
        } catch {}
        try {
            const closeBtn = await $('button svg.lucide-x');
            if (await closeBtn.isDisplayed()) {
                await closeBtn.closest('button').click();
                await browser.pause(500);
            }
        } catch {}
    });

    it('should have healthy API', async () => {
        const health = await browser.execute(async (base) => {
            const res = await fetch(`${base}/health`);
            return res.json();
        }, API_BASE);

        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('frame_status');
        expect(health).toHaveProperty('status_code');
    });

    it('should return OCR search results', async () => {
        const data = await browser.execute(async (base) => {
            const res = await fetch(`${base}/search?limit=5&content_type=ocr`);
            return res.json();
        }, API_BASE);

        expect(data).toHaveProperty('data');
        expect(Array.isArray(data.data)).toBe(true);
    });

    it('should return search results with query', async () => {
        const data = await browser.execute(async (base) => {
            const res = await fetch(`${base}/search?limit=5&q=test`);
            return res.json();
        }, API_BASE);

        expect(data).toHaveProperty('data');
        expect(data).toHaveProperty('pagination');
    });

    it('should handle search with date range', async () => {
        const data = await browser.execute(async (base) => {
            const today = new Date().toISOString().split('T')[0] + 'T00:00:00Z';
            const res = await fetch(`${base}/search?limit=5&start_time=${today}`);
            return { ok: res.ok, status: res.status };
        }, API_BASE);

        expect(data.ok).toBe(true);
    });

    it('should handle concurrent requests without errors', async () => {
        const results = await browser.execute(async (base) => {
            const promises = Array.from({ length: 5 }, () =>
                fetch(`${base}/search?limit=1`).then(r => ({ ok: r.ok, status: r.status }))
            );
            return Promise.all(promises);
        }, API_BASE);

        const failures = results.filter(r => !r.ok);
        expect(failures.length).toBe(0);
    });

    it('should not return 500 on invalid content_type', async () => {
        const result = await browser.execute(async (base) => {
            const res = await fetch(`${base}/search?content_type=invalid`);
            return { status: res.status };
        }, API_BASE);

        expect(result.status).not.toBe(500);
    });

    it('should have pipes endpoint accessible', async () => {
        const result = await browser.execute(async (base) => {
            const res = await fetch(`${base}/pipes/list`);
            return { status: res.status };
        }, API_BASE);

        // 200, 403, or 404 are fine — not 500
        expect(result.status).not.toBe(500);
    });
});
