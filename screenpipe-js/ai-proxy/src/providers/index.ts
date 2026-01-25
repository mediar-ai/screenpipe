import { VertexAIProvider } from './vertex';
import { AIProvider } from './base';
import { Env } from '../types';

export function createProvider(model: string, env: Env): AIProvider {
	// Use Vertex AI for all Claude models
	if (!env.VERTEX_SERVICE_ACCOUNT_JSON || !env.VERTEX_PROJECT_ID) {
		throw new Error('Vertex AI credentials not configured');
	}
	return new VertexAIProvider(
		env.VERTEX_SERVICE_ACCOUNT_JSON,
		env.VERTEX_PROJECT_ID,
		env.VERTEX_REGION || 'us-east5'
	);
}

export type { AIProvider };
