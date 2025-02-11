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
exports.generateMeetingNote = generateMeetingNote;
const openai_1 = require("openai");
function generateMeetingNote(chunks, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const openai = new openai_1.OpenAI({
            apiKey: settings.aiProviderType === "screenpipe-cloud"
                ? settings.user.token
                : settings.openaiApiKey,
            baseURL: settings.aiUrl,
            dangerouslyAllowBrowser: true,
        });
        try {
            console.log("generating meeting note from chunks:", {
                chunks_count: chunks.length
            });
            const transcript = chunks
                .map(c => { var _a; return `[${(_a = c.speaker) !== null && _a !== void 0 ? _a : 'unknown'}]: ${c.text}`; })
                .join("\n");
            const messages = [
                {
                    role: "system",
                    content: `generate a single, concise first-person note about what happened in this meeting segment.
                         be factual and specific.
                         use "i" perspective.
                         keep it a few word sentence.
                         do not use quotes.`
                },
                {
                    role: "user",
                    content: `conversation transcript:
                ${transcript}`
                }
            ];
            console.log("sending request to openai for note generation");
            const response = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages,
                temperature: 0.3,
                max_tokens: 60,
            });
            const note = ((_c = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || "failed to generate note";
            console.log("generated note:", { note });
            return note;
        }
        catch (error) {
            console.error("error generating meeting note:", error);
            return "failed to generate note";
        }
    });
}
