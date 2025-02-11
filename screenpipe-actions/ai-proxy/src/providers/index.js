"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProvider = createProvider;
const openai_1 = require("./openai");
const anthropic_1 = require("./anthropic");
const gemini_1 = require("./gemini");
function createProvider(model, env) {
    if (model.toLowerCase().includes('claude')) {
        return new anthropic_1.AnthropicProvider(env.ANTHROPIC_API_KEY);
    }
    if (model.toLowerCase().includes('gemini')) {
        return new gemini_1.GeminiProvider(env.GEMINI_API_KEY);
    }
    return new openai_1.OpenAIProvider(env.OPENAI_API_KEY);
}
