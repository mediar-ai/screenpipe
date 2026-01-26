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

	const region = env.VERTEX_REGION || 'global';

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
 * These are the exact model IDs to use - no mapping, pass directly
 */
export async function handleVertexModels(env: Env): Promise<Response> {
	const models = [
		// Claude 4.5
		{ id: 'claude-opus-4-5@20251101', object: 'model', created: 1730419200, owned_by: 'anthropic' },
		{ id: 'claude-sonnet-4-5@20250929', object: 'model', created: 1727568000, owned_by: 'anthropic' },
		{ id: 'claude-haiku-4-5@20251001', object: 'model', created: 1727740800, owned_by: 'anthropic' },
		// Claude 4
		{ id: 'claude-opus-4@20250514', object: 'model', created: 1747180800, owned_by: 'anthropic' },
		{ id: 'claude-sonnet-4@20250514', object: 'model', created: 1747180800, owned_by: 'anthropic' },
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
