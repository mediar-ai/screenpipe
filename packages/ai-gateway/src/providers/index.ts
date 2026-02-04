import { OpenAIProvider } from './openai';
import { VertexAIProvider } from './vertex';
import { GeminiProvider } from './gemini';
import { AIProvider } from './base';
import { Env } from '../types';

export function createProvider(model: string, env: Env): AIProvider {
	if (model.toLowerCase().includes('claude')) {
		// Use Vertex AI for Claude models
		if (!env.VERTEX_SERVICE_ACCOUNT_JSON || !env.VERTEX_PROJECT_ID) {
			throw new Error('Vertex AI credentials not configured');
		}
		return new VertexAIProvider(
			env.VERTEX_SERVICE_ACCOUNT_JSON,
			env.VERTEX_PROJECT_ID,
			env.VERTEX_REGION || 'us-east5'
		);
	}
	if (model.toLowerCase().includes('gemini')) {
		// Use Vertex AI for Gemini models
		if (!env.VERTEX_SERVICE_ACCOUNT_JSON || !env.VERTEX_PROJECT_ID) {
			throw new Error('Vertex AI credentials not configured for Gemini');
		}
		return new GeminiProvider(
			env.VERTEX_SERVICE_ACCOUNT_JSON,
			env.VERTEX_PROJECT_ID,
			'us-central1' // Gemini uses us-central1 region
		);
	}
	return new OpenAIProvider(env.OPENAI_API_KEY);
}

export type { AIProvider };
