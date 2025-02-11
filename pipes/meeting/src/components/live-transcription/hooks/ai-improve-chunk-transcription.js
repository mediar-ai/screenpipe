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
exports.improveTranscription = improveTranscription;
exports.improveTranscriptionBatch = improveTranscriptionBatch;
const openai_1 = require("openai");
const storage_vocabulary_1 = require("./storage-vocabulary");
function improveTranscription(text, context, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const openai = new openai_1.OpenAI({
            apiKey: settings.aiProviderType === "screenpipe-cloud"
                ? settings.user.token
                : settings.openaiApiKey,
            baseURL: settings.aiUrl,
            dangerouslyAllowBrowser: true,
        });
        try {
            console.log("improving transcription quality:", {
                text_length: text.length,
                context: {
                    has_title: !!context.meetingTitle,
                    chunks_count: context.recentChunks.length,
                    notes_count: ((_a = context.notes) === null || _a === void 0 ? void 0 : _a.length) || 0,
                    vocab_count: ((_b = context.vocabulary) === null || _b === void 0 ? void 0 : _b.length) || 0
                }
            });
            // Build context from recent chunks
            const recentTranscript = context.recentChunks
                .map(c => { var _a; return `[${(_a = c.speaker) !== null && _a !== void 0 ? _a : 'unknown'}]: ${c.text}`; })
                .join("\n");
            // Get vocabulary corrections if any
            const vocabulary = context.vocabulary || (yield (0, storage_vocabulary_1.getVocabularyEntries)());
            const vocabContext = vocabulary.length > 0
                ? `Previous corrections:\n${vocabulary.map(v => `"${v.original}" → "${v.corrected}"`).join("\n")}`
                : "";
            const messages = [
                {
                    role: "system",
                    content: `you are an expert at improving speech-to-text transcription quality. 
                         focus on fixing common transcription errors while preserving the original meaning.
                         use provided vocabulary corrections and meeting context to improve accuracy.
                         maintain original capitalization and punctuation style.
                         return only the improved text without any quotation marks or additional commentary.`
                },
                {
                    role: "user",
                    content: `improve this transcription considering the context:

                meeting title: ${context.meetingTitle || 'unknown'}

                recent conversation:
                ${recentTranscript}

                ${vocabContext}

                notes context:
                ${((_c = context.notes) === null || _c === void 0 ? void 0 : _c.join("\n")) || 'no notes'}

                text to improve:
                ${text}`
                }
            ];
            console.log("sending request to openai for transcription improvement");
            const response = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages,
                temperature: 0.3, // lower temperature for more consistent corrections
                max_tokens: text.length * 2, // allow some expansion
            });
            let improved = ((_f = (_e = (_d = response.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) === null || _f === void 0 ? void 0 : _f.trim()) || text;
            // Remove any quotation marks from the response
            improved = improved.replace(/^["']|["']$/g, '').trim();
            console.log("improved transcription:", {
                original: text,
                improved
            });
            return improved;
        }
        catch (error) {
            console.error("error improving transcription:", error);
            return text;
        }
    });
}
// Helper to improve multiple chunks in parallel
function improveTranscriptionBatch(chunks, meeting, settings) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        const vocabulary = yield (0, storage_vocabulary_1.getVocabularyEntries)();
        // Process in parallel with concurrency limit
        const concurrencyLimit = 3;
        const batches = [];
        for (let i = 0; i < chunks.length; i += concurrencyLimit) {
            batches.push(chunks.slice(i, i + concurrencyLimit));
        }
        for (const batch of batches) {
            const promises = batch.map((chunk, idx) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const context = {
                    meetingTitle: meeting.humanName || meeting.aiName || undefined,
                    recentChunks: chunks.slice(Math.max(0, idx - 5), idx + 5),
                    notes: (_a = meeting.notes) === null || _a === void 0 ? void 0 : _a.map(note => note.text),
                    vocabulary
                };
                const improved = yield improveTranscription(chunk.text, context, settings);
                results[idx] = improved;
            }));
            yield Promise.all(promises);
        }
        return results;
    });
}
