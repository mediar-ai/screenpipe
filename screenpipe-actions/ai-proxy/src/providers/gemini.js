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
exports.GeminiProvider = void 0;
const generative_ai_1 = require("@google/generative-ai");
class GeminiProvider {
    constructor(apiKey) {
        this.supportsTools = true;
        this.supportsVision = true;
        this.supportsJson = true;
        this.client = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    createGenerationConfig(body) {
        var _a, _b;
        const config = {
            temperature: body.temperature,
        };
        if (((_a = body.response_format) === null || _a === void 0 ? void 0 : _a.type) === 'json_schema' && body.response_format.schema) {
            config.responseMimeType = 'application/json';
            config.responseSchema = body.response_format.schema;
        }
        else if (((_b = body.response_format) === null || _b === void 0 ? void 0 : _b.type) === 'json_object') {
            config.responseMimeType = 'application/json';
        }
        return config;
    }
    createCompletion(body) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.model = this.client.getGenerativeModel({ model: body.model, generationConfig: this.createGenerationConfig(body) });
            const chat = this.model.startChat({
                history: this.formatMessages(body.messages),
                generationConfig: {
                    temperature: body.temperature,
                },
            });
            const prompt = ((_a = body.response_format) === null || _a === void 0 ? void 0 : _a.type) === 'json_object'
                ? `${body.messages[body.messages.length - 1].content}\nRespond with valid JSON only.`
                : body.messages[body.messages.length - 1].content;
            const result = yield chat.sendMessage(prompt);
            const response = yield result.response;
            return new Response(JSON.stringify(this.formatResponse(response)), {
                headers: { 'Content-Type': 'application/json' },
            });
        });
    }
    createStreamingCompletion(body) {
        return __awaiter(this, void 0, void 0, function* () {
            this.model = this.client.getGenerativeModel({ model: body.model });
            const chat = this.model.startChat({
                history: this.formatMessages(body.messages),
                generationConfig: {
                    temperature: body.temperature,
                },
            });
            const result = yield chat.sendMessage(body.messages[body.messages.length - 1].content);
            return new ReadableStream({
                start(controller) {
                    return __awaiter(this, void 0, void 0, function* () {
                        try {
                            const response = yield result.response;
                            const text = response.text();
                            const chunkSize = 20;
                            for (let i = 0; i < text.length; i += chunkSize) {
                                const chunk = text.slice(i, i + chunkSize);
                                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                                    choices: [{ delta: { content: chunk } }],
                                })}\n\n`));
                                yield new Promise((resolve) => setTimeout(resolve, 10));
                            }
                            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                            controller.close();
                        }
                        catch (error) {
                            controller.error(error);
                        }
                    });
                },
            });
        });
    }
    formatMessages(messages) {
        return messages.map((msg) => ({
            role: this.mapRole(msg.role),
            parts: Array.isArray(msg.content)
                ? msg.content.map((part) => {
                    var _a;
                    if (part.type === 'image') {
                        return {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: (_a = part.image) === null || _a === void 0 ? void 0 : _a.url,
                            },
                        };
                    }
                    return { text: part.text || '' };
                })
                : [{ text: msg.content }],
        }));
    }
    mapRole(role) {
        switch (role) {
            case 'user':
                return 'user';
            case 'assistant':
                return 'model';
            case 'system':
                return 'user';
            default:
                return 'user';
        }
    }
    formatResponse(response) {
        return {
            choices: [
                {
                    message: {
                        content: response.text(),
                        role: 'assistant',
                    },
                },
            ],
        };
    }
    listModels() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.client.apiKey}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch Gemini models: ${response.statusText}`);
                }
                const data = yield response.json();
                return data.models
                    .filter((model) => {
                    var _a, _b;
                    // Check if model has generateContent method and is not an embedding model
                    return (((_a = model.supportedGenerationMethods) === null || _a === void 0 ? void 0 : _a.includes('generateContent')) && !((_b = model.supportedGenerationMethods) === null || _b === void 0 ? void 0 : _b.includes('embedContent')));
                })
                    .map((model) => ({
                    id: model.name.replace('models/', ''),
                    name: model.displayName || model.name.replace('models/', ''),
                    provider: 'google',
                }));
            }
            catch (error) {
                console.error('Failed to fetch Gemini models:', error);
                // Updated fallback to only latest models
                return [
                    {
                        id: 'gemini-1.5-pro',
                        name: 'Gemini 1.5 Pro',
                        provider: 'google',
                    },
                    {
                        id: 'gemini-1.5-flash',
                        name: 'Gemini 1.5 Flash',
                        provider: 'google',
                    },
                ];
            }
        });
    }
}
exports.GeminiProvider = GeminiProvider;
