import { Page, ElementHandle } from 'puppeteer-core';

export async function showClickAnimation(page: Page, elementOrSelector: ElementHandle | string) {
    try {
        const element = typeof elementOrSelector === 'string' 
            ? await page.$(elementOrSelector)
            : elementOrSelector;
            
        if (!element) {
            console.log('no element found for click animation');
            return;
        }

        const box = await element.boundingBox();
        if (!box) {
            console.log('no bounding box found for click animation');
            return;
        }

        const x = box.x + box.width/2;
        const y = box.y + box.height/2;

        await page.evaluate(({ x, y }) => {
            const div = document.createElement('div');
            div.style.cssText = `
                position: fixed;
                width: 40px;
                height: 40px;
                background: rgba(255, 0, 128, 0.3);
                border: 3px solid #00ff00;
                box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
                border-radius: 50%;
                pointer-events: none;
                z-index: 999999;
                left: ${x - 20}px;
                top: ${y - 20}px;
                animation: clickRipple 1.2s ease-out;
            `;

            // add keyframe animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes clickRipple {
                    0% {
                        transform: scale(0.3);
                        opacity: 1;
                        border-color: #00ff00;
                    }
                    50% {
                        border-color: #ff00ff;
                        box-shadow: 0 0 30px rgba(255, 0, 255, 0.6);
                    }
                    100% {
                        transform: scale(3);
                        opacity: 0;
                        border-color: #0000ff;
                    }
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(div);

            // remove after animation
            setTimeout(() => {
                div.remove();
            }, 1200);
        }, { x, y });
    } catch (e) {
        console.log('click animation failed:', e);
    }
}

// test the animation if run directly
// if (require.main === module) {
//     (async () => {
//         const { setupBrowser } = require('./browser_setup');
//         const { page } = await setupBrowser();
        
//         // get viewport dimensions
//         const viewport = await page.viewport();
//         const centerX = viewport ? viewport.width / 2 : 500;
//         const centerY = viewport ? viewport.height / 2 : 500;

//         // show animation in center
//         await showClickAnimation(page, centerX, centerY);
        
//         // no need to cleanup browser since we're using existing one
//         await new Promise(r => setTimeout(r, 1500));
//     })().catch(console.error);
// }