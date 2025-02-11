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
exports.clickSend = clickSend;
const click_animation_1 = require("./click-animation");
function clickSend(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const sendButtonSelector = 'button.msg-form__send-button[type="submit"]';
            yield page.waitForSelector(sendButtonSelector);
            console.log('found send button');
            yield (0, click_animation_1.showClickAnimation)(page, sendButtonSelector);
            yield page.keyboard.down('Control');
            yield page.keyboard.press('Enter');
            yield page.keyboard.up('Control');
            console.log('sent message via Ctrl+Enter');
        }
        catch (e) {
            console.error('failed to click send button:', e);
        }
    });
}
