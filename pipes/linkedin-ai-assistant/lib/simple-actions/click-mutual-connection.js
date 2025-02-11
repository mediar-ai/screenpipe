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
exports.clickMutualConnections = clickMutualConnections;
const click_animation_1 = require("./click-animation");
function clickMutualConnections(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const mutualSelector = 'a[href*="facetNetwork"][href*="facetConnectionOf"]';
            yield page.waitForSelector(mutualSelector, { timeout: 5000 });
            console.log('found mutual connections link');
            yield (0, click_animation_1.showClickAnimation)(page, mutualSelector);
            yield page.click(mutualSelector);
            console.log('clicked mutual connections');
            yield page.waitForSelector('.search-results-container', { timeout: 5000 });
            console.log('mutual connections page loaded');
        }
        catch (e) {
            console.error('failed to click mutual connections:', e);
        }
    });
}
