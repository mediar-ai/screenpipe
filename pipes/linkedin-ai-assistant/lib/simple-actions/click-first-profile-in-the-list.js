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
exports.clickFirstProfile = clickFirstProfile;
const click_animation_1 = require("./click-animation");
function clickFirstProfile(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Wait for the list and first profile link to be available
            const profileSelector = 'ul[role="list"] li:first-child .t-16 a[data-test-app-aware-link]';
            yield page.waitForSelector(profileSelector, { timeout: 5000 });
            console.log('found first profile link');
            yield (0, click_animation_1.showClickAnimation)(page, profileSelector);
            yield page.click(profileSelector);
            console.log('clicked first profile link');
            // Wait for profile page to load (indicated by h1 presence)
            yield page.waitForSelector('h1', { timeout: 5000 });
            console.log('profile page loaded');
        }
        catch (e) {
            console.error('failed to click first profile:', e);
        }
    });
}
