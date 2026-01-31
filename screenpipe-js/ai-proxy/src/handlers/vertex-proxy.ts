/**
 * Vertex AI Proxy Handler for Claude Agent SDK
 *
 * This handler proxies Anthropic Messages API requests to Vertex AI,
 * allowing users to use the Agent SDK without setting up GCP credentials.
 *
 * The Agent SDK sends requests to:
 *   ANTHROPIC_VERTEX_BASE_URL/v1/messages
 *
 * This handler receives those requests and forwards them to Vertex AI
 * with proper authentication using the service account.
 */

import { Env } from '../types';
import { proxyToVertex } from '../providers/vertex';
import { addCorsHeaders } from '../utils/cors';

/**
 * Handle Vertex AI proxy requests for the Agent SDK
 */
export async function handleVertexProxy(request: Request, env: Env): Promise<Response> {
	// Validate required env vars
	if (!env.VERTEX_SERVICE_ACCOUNT_JSON) {
		return new Response(JSON.stringify({ error: 'Vertex AI service account not configured' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!env.VERTEX_PROJECT_ID) {
		return new Response(JSON.stringify({ error: 'Vertex AI project ID not configured' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const region = env.VERTEX_REGION || 'us-east5';

	try {
		const response = await proxyToVertex(request, env.VERTEX_SERVICE_ACCOUNT_JSON, env.VERTEX_PROJECT_ID, region);

		return addCorsHeaders(response);
	} catch (error: any) {
		console.error('Vertex proxy error:', error);
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

/**
 * Handle Vertex AI model listing
 * All get mapped to claude-sonnet-4@20250514 internally
 */
export async function handleVertexModels(env: Env): Promise<Response> {
	const models = [
		{ id: 'gemini-3-pro-preview', object: 'model', created: 1747180800, owned_by: 'google' },
		{ id: 'gemini-3-flash-preview', object: 'model', created: 1747180800, owned_by: 'google' },
		{ id: 'claude-opus-4-5@20251101', object: 'model', created: 1747180800, owned_by: 'anthropic' },
		{ id: 'claude-haiku-4-5@20251001', object: 'model', created: 1747180800, owned_by: 'anthropic' },
	];

	return addCorsHeaders(
		new Response(
			JSON.stringify({
				object: 'list',
				data: models,
			}),
			{
				headers: { 'Content-Type': 'application/json' },
			}
		)
	);
}
