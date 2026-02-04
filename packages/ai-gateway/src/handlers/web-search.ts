import { Env } from '../types';
import { GeminiProvider } from '../providers/gemini';
import { addCorsHeaders, createErrorResponse } from '../utils/cors';

interface WebSearchRequest {
	query: string;
}

/**
 * Handle web search requests using Gemini's Google Search grounding
 */
export async function handleWebSearch(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as WebSearchRequest;

		if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
			return addCorsHeaders(createErrorResponse(400, JSON.stringify({
				error: 'invalid_request',
				message: 'Missing or empty "query" field',
			})));
		}

		if (!env.VERTEX_SERVICE_ACCOUNT_JSON || !env.VERTEX_PROJECT_ID) {
			return addCorsHeaders(createErrorResponse(500, JSON.stringify({
				error: 'configuration_error',
				message: 'Search backend not configured',
			})));
		}

		const provider = new GeminiProvider(
			env.VERTEX_SERVICE_ACCOUNT_JSON,
			env.VERTEX_PROJECT_ID,
			'us-central1'
		);

		const result = await provider.executeWebSearch(body.query.trim());

		return addCorsHeaders(new Response(JSON.stringify({
			query: body.query.trim(),
			content: result.content,
			sources: result.sources,
		}), {
			headers: { 'Content-Type': 'application/json' },
		}));
	} catch (error: any) {
		console.error('Web search error:', error?.message);
		return addCorsHeaders(createErrorResponse(500, JSON.stringify({
			error: 'search_failed',
			message: error?.message || 'Web search failed',
		})));
	}
}
