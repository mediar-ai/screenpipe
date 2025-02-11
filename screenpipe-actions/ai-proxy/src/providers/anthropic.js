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
exports.AnthropicProvider = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
class AnthropicProvider {
    constructor(apiKey) {
        this.supportsTools = true;
        this.supportsVision = true;
        this.supportsJson = true;
        this.client = new sdk_1.default({ apiKey });
    }
    createCompletion(body) {
        return __awaiter(this, void 0, void 0, function* () {
            const messages = this.formatMessages(body.messages);
            const response = yield this.client.messages.create({
                messages,
                model: body.model,
                max_tokens: 4096,
                temperature: body.temperature,
                system: this.createSystemPrompt(body.response_format),
                tools: body.tools ? this.formatTools(body.tools) : undefined,
            });
            return new Response(JSON.stringify(this.formatResponse(response)), {
                headers: { 'Content-Type': 'application/json' },
            });
        });
    }
    createSystemPrompt(responseFormat) {
        if (!responseFormat)
            return undefined;
        switch (responseFormat.type) {
            case 'json_object':
                return 'Respond with valid JSON only.';
            case 'json_schema':
                if (!responseFormat.schema)
                    return undefined;
                return `Respond with valid JSON that strictly follows this schema:
	${JSON.stringify(responseFormat.schema, null, 2)}
	Do not include any explanatory text - output valid JSON only.`;
            default:
                return undefined;
        }
    }
    createStreamingCompletion(body) {
        return __awaiter(this, void 0, void 0, function* () {
            const stream = yield this.client.messages.create({
                messages: this.formatMessages(body.messages),
                model: body.model,
                stream: true,
                max_tokens: 4096,
                temperature: body.temperature,
            });
            return new ReadableStream({
                start(controller) {
                    return __awaiter(this, void 0, void 0, function* () {
                        var _a, e_1, _b, _c;
                        var _d;
                        try {
                            try {
                                for (var _e = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _e = true) {
                                    _c = stream_1_1.value;
                                    _e = false;
                                    const chunk = _c;
                                    if (chunk.type === 'content_block_delta' && ((_d = chunk.delta) === null || _d === void 0 ? void 0 : _d.type) === 'text_delta') {
                                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
                                            choices: [{ delta: { content: chunk.delta.text } }],
                                        })}\n\n`));
                                    }
                                }
                            }
                            catch (e_1_1) { e_1 = { error: e_1_1 }; }
                            finally {
                                try {
                                    if (!_e && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
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
    formatTools(tools) {
        return tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
        }));
    }
    formatMessages(messages) {
        return messages.map((msg) => {
            const content = Array.isArray(msg.content)
                ? msg.content.map((part) => {
                    var _a;
                    if (part.type === 'image') {
                        return {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/jpeg',
                                data: ((_a = part.image) === null || _a === void 0 ? void 0 : _a.url) || '',
                            },
                        };
                    }
                    return {
                        type: 'text',
                        text: part.text || '',
                    };
                })
                : [
                    {
                        type: 'text',
                        text: msg.content,
                    },
                ];
            return {
                role: msg.role === 'user' ? 'user' : 'assistant',
                content,
            };
        });
    }
    formatResponse(response) {
        const textBlock = response.content.find((block) => block.type === 'text');
        const textContent = (textBlock === null || textBlock === void 0 ? void 0 : textBlock.text) || '';
        return {
            choices: [
                {
                    message: {
                        content: textContent,
                        role: 'assistant',
                        tool_calls: response.content
                            .filter((block) => block.type === 'tool_use')
                            .map((block) => ({
                            type: block.type,
                            function: {
                                name: block.name,
                                arguments: JSON.stringify(block.input),
                            },
                        })),
                    },
                },
            ],
        };
    }
    listModels() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield this.client.models.list();
                return response.data.map((model) => ({
                    id: model.id,
                    name: model.display_name,
                    provider: 'anthropic',
                }));
            }
            catch (error) {
                console.error('Failed to fetch Anthropic models:', error);
                // Fallback to known models if API fails
                return [
                    {
                        id: 'claude-3-5-sonnet-latest',
                        name: 'Claude 3.5 Sonnet',
                        provider: 'anthropic',
                    },
                    {
                        id: 'claude-3-5-haiku-latest',
                        name: 'Claude 3.5 Haiku',
                        provider: 'anthropic',
                    },
                ];
            }
        });
    }
}
exports.AnthropicProvider = AnthropicProvider;
