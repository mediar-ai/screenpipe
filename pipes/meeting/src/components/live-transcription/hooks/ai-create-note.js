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
exports.improveNote = improveNote;
const openai_1 = require("openai");
function improveNote(context, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        console.log("note ai settings:", {
            provider: settings.aiProviderType,
            has_token: !!((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token),
            has_key: !!settings.openaiApiKey,
            url: settings.aiUrl,
            model: settings.aiModel
        });
        const openai = new openai_1.OpenAI({
            apiKey: settings.aiProviderType === "screenpipe-cloud"
                ? settings.user.token
                : settings.openaiApiKey,
            baseURL: settings.aiUrl,
            dangerouslyAllowBrowser: true,
        });
        try {
            console.log("improving note with full context:", {
                note: context.note,
                context: context.context,
                title: context.title,
                settings: {
                    provider: settings.aiProviderType,
                    model: settings.aiModel
                }
            });
            console.log("improving note:", {
                note_text: context.note.text,
                context: context.context,
                title: context.title
            });
            const messages = [
                {
                    role: "system",
                    content: `you are me, improving my meeting notes.
                         return a single, concise sentence in lowercase.
                         use the transcription context for accuracy.
                         focus on the key point or action item.
                         preserve any markdown formatting.
                         be brief and direct.`
                },
                {
                    role: "user",
                    content: `improve this note considering the context:

                meeting title: ${context.title || 'unknown'}

                transcription context:
                ${context.context}

                note to improve:
                ${context.note.text}`
                }
            ];
            console.log("sending request to openai for note improvement");
            const response = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages,
                temperature: 0.3,
                max_tokens: context.note.text.length * 2,
            });
            const improved = ((_d = (_c = (_b = response.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim()) || context.note.text;
            console.log("improved note:", {
                original: context.note.text,
                improved
            });
            return improved;
        }
        catch (error) {
            console.error("error improving note (full):", {
                error,
                context,
                settings: {
                    provider: settings.aiProviderType,
                    model: settings.aiModel
                }
            });
            return context.note.text;
        }
    });
}
