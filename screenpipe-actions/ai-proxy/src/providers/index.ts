import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { AIProvider } from './base';
import { Env } from '../types';

export function createProvider(model: string, env: Env): AIProvider {
	if (model.toLowerCase().includes('claude')) {
		return new AnthropicProvider(env.ANTHROPIC_API_KEY);
	}
	if (model.toLowerCase().includes('gemini')) {
		return new GeminiProvider(env.GEMINI_API_KEY);
	}
	return new OpenAIProvider(env.OPENAI_API_KEY);
}

export type { AIProvider };
