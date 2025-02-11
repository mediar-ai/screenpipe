"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.highlightElement = highlightElement;
function highlightElement(page, elementOrSelector) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const element = typeof elementOrSelector === 'string'
                ? yield page.$(elementOrSelector)
                : elementOrSelector;
            if (!element) {
                console.log('no element found for highlight animation');
                return;
            }
            const box = yield element.boundingBox();
            if (!box) {
                console.log('no bounding box found for highlight animation');
                return;
            }
            yield page.evaluate(({ x, y, width, height }) => {
                const div = document.createElement('div');
                div.style.cssText = `
                position: fixed;
                width: ${width}px;
                height: ${height}px;
                left: ${x}px;
                top: ${y}px;
                border: 3px solid #00ff00;
                background: rgba(0, 255, 0, 0.1);
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
                pointer-events: none;
                z-index: 999999;
                animation: highlightPulse 1s ease-in-out;
            `;
                const style = document.createElement('style');
                style.textContent = `
                @keyframes highlightPulse {
                    0% {
                        transform: scale(0.95);
                        opacity: 0;
                    }
                    50% {
                        transform: scale(1.02);
                        opacity: 1;
                    }
                    100% {
                        transform: scale(1);
                        opacity: 0;
                    }
                }
            `;
                document.head.appendChild(style);
                document.body.appendChild(div);
                setTimeout(() => {
                    div.remove();
                }, 1000);
            }, box);
        }
        catch (e) {
            console.log('highlight animation failed:', e);
        }
    });
}
