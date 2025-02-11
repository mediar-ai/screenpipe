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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const openai_1 = __importDefault(require("openai"));
class OpenAIProvider {
    constructor(apiKey) {
        this.supportsTools = true;
        this.supportsVision = true;
        this.supportsJson = true;
        this.client = new openai_1.default({ apiKey });
    }
    createJSONSchemaFormat(schema, name, description) {
        return {
            type: 'json_schema',
            json_schema: {
                name,
                description,
                schema,
                strict: true,
            },
        };
    }
    formatResponseFormat(format) {
        if (!format)
            return undefined;
        switch (format.type) {
            case 'json_object':
                return { type: 'json_object' };
            case 'json_schema':
                if (!format.schema || !format.name) {
                    throw new Error('Schema and name are required for json_schema response format');
                }
                return this.createJSONSchemaFormat(format.schema, format.name, format.description);
            default:
                return undefined;
        }
    }
    createCompletion(body) {
        return __awaiter(this, void 0, void 0, function* () {
            const messages = this.formatMessages(body.messages);
            const responseFormat = this.formatResponseFormat(body.response_format);
            const params = {
                model: body.model,
                messages,
                temperature: body.temperature,
                stream: false,
                response_format: responseFormat,
                tools: body.tools,
                tool_choice: body.tool_choice,
            };
            const response = yield this.client.chat.completions.create(params);
            return new Response(JSON.stringify(this.formatResponse(response)), {
                headers: { 'Content-Type': 'application/json' },
            });
        });
    }
    createStreamingCompletion(body) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const stream = yield this.client.chat.completions.create({
                model: body.model,
                messages: this.formatMessages(body.messages),
                temperature: body.temperature,
                stream: true,
                response_format: ((_a = body.response_format) === null || _a === void 0 ? void 0 : _a.type) === 'json_object'
                    ? { type: 'json_object' }
                    : ((_b = body.response_format) === null || _b === void 0 ? void 0 : _b.type) === 'json_schema'
                        ? {
                            type: 'json_schema',
                            json_schema: {
                                schema: body.response_format.schema,
                                name: body.response_format.name || 'default',
                                strict: true,
                            },
                        }
                        : undefined,
                tools: body.tools,
            });
            return new ReadableStream({
                start(controller) {
                    return __awaiter(this, void 0, void 0, function* () {
                        var _a, e_1, _b, _c;
                        var _d, _e;
                        try {
                            try {
                                for (var _f = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _f = true) {
                                    _c = stream_1_1.value;
                                    _f = false;
                                    const chunk = _c;
                                    const content = (_e = (_d = chunk.choices[0]) === null || _d === void 0 ? void 0 : _d.delta) === null || _e === void 0 ? void 0 : _e.content;
                                    if (content) {
                                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                                            choices: [{ delta: { content } }],
                                        })}\n\n`));
                                    }
                                }
                            }
                            catch (e_1_1) { e_1 = { error: e_1_1 }; }
                            finally {
                                try {
                                    if (!_f && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                                }
                                finally { if (e_1) throw e_1.error; }
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
            role: msg.role,
            content: Array.isArray(msg.content)
                ? msg.content.map((part) => {
                    var _a;
                    if (part.type === 'image') {
                        return {
                            type: 'image_url',
                            image_url: {
                                url: (_a = part.image) === null || _a === void 0 ? void 0 : _a.url,
                                detail: 'auto',
                            },
                        };
                    }
                    return { type: 'text', text: part.text || '' };
                })
                : msg.content,
            tool_calls: msg.tool_calls,
            name: msg.name,
            refusal: null,
        }));
    }
    formatResponse(response) {
        return {
            choices: [
                {
                    message: {
                        content: response.choices[0].message.content,
                        role: 'assistant',
                        tool_calls: response.choices[0].message.tool_calls,
                    },
                },
            ],
        };
    }
    listModels() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield this.client.models.list();
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                return response.data
                    .filter((model) => {
                    // Filter out non-LLM models
                    const isNonLLM = model.id.includes('dall-e') || model.id.includes('whisper') || model.id.includes('tts') || model.id.includes('embedding');
                    if (isNonLLM)
                        return false;
                    // Check if model is recent (created within last 6 months)
                    const createdAt = new Date(model.created * 1000); // Convert Unix timestamp to Date
                    return createdAt > sixMonthsAgo;
                })
                    .map((model) => ({
                    id: model.id,
                    name: model.id,
                    provider: 'openai',
                }));
            }
            catch (error) {
                console.error('Failed to fetch OpenAI models:', error);
                return [];
            }
        });
    }
}
exports.OpenAIProvider = OpenAIProvider;
