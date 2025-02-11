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
exports.callGPT4 = callGPT4;
function callGPT4(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const messages = [
                {
                    role: 'system',
                    content: ''
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];
            const body = {
                model: 'gpt-4o',
                messages,
                temperature: 0.5,
                stream: false
            };
            const response = yield fetch('https://ai-proxy.i-f9f.workers.dev/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            const data = yield response.json();
            if (data.error) {
                throw new Error(data.error.message || 'unknown error');
            }
            if (!((_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content)) {
                throw new Error('no content in response');
            }
            const result = {
                content: data.choices[0].message.content,
                model: data.model || 'unknown',
                usage: data.usage || {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                },
            };
            return result;
        }
        catch (error) {
            console.error('error calling gpt-4:', error);
            throw error;
        }
    });
}
