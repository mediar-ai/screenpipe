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
exports.checkIfRestricted = checkIfRestricted;
function checkIfRestricted(page) {
    return __awaiter(this, void 0, void 0, function* () {
        // check url first as it's fastest
        const url = page.url();
        if (url.includes('checkpoint/challenge')) {
            console.log('restriction detected via url pattern');
            return extractRestrictionInfo(page);
        }
        // check for restriction message in content
        const content = yield page.content();
        if (content.includes('your account is temporarily restricted')) {
            console.log('restriction detected via page content');
            return extractRestrictionInfo(page);
        }
        return { isRestricted: false };
    });
}
function extractRestrictionInfo(page) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // try to get the restriction message
            const messageEl = yield page.$('section.rehabMessageScreen p');
            const message = (yield (messageEl === null || messageEl === void 0 ? void 0 : messageEl.evaluate(el => { var _a; return (_a = el.textContent) === null || _a === void 0 ? void 0 : _a.trim(); }))) || '';
            // try to extract date
            const dateMatch = message.match(/until (.*?) PST/);
            const restrictionEndDate = dateMatch ? new Date(dateMatch[1]).toISOString() : undefined;
            return {
                isRestricted: true,
                restrictionEndDate,
                reason: message
            };
        }
        catch (error) {
            console.log('error extracting restriction details:', error);
            return { isRestricted: true };
        }
    });
}
// usage example:
/*
async function someLinkedInOperation(page: Page) {
  const restrictionStatus = await checkIfRestricted(page);
  if (restrictionStatus.isRestricted) {
    console.log('account restricted until:', restrictionStatus.restrictionEndDate);
    throw new Error('linkedin account is restricted');
  }
  
  // continue with normal operation
}
*/ 
