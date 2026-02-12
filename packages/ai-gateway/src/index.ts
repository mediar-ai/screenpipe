import { captureException, wrapRequestHandler } from '@sentry/cloudflare';
import { Env, RequestBody, AuthResult } from './types';
import { handleOptions, createSuccessResponse, createErrorResponse, addCorsHeaders } from './utils/cors';
import { validateAuth } from './utils/auth';
import { RateLimiter, checkRateLimit } from './utils/rate-limiter';
import { trackUsage, getUsageStatus, isModelAllowed, TIER_CONFIG } from './services/usage-tracker';
import { handleChatCompletions } from './handlers/chat';
import { handleModelListing } from './handlers/models';
import { handleFileTranscription, handleWebSocketUpgrade } from './handlers/transcription';
import { handleVoiceTranscription, handleVoiceQuery, handleTextToSpeech, handleVoiceChat } from './handlers/voice';
import { handleVertexProxy, handleVertexModels } from './handlers/vertex-proxy';
import { handleWebSearch } from './handlers/web-search';
// import { handleTTSWebSocketUpgrade } from './handlers/voice-ws';

export { RateLimiter };

// Handler function for the worker
async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;

	// Early test endpoint - before any initialization
	if (path === '/test') {
		return new Response('ai proxy is working!', { status: 200 });
	}

	try {
		if (request.method === 'OPTIONS') {
			return handleOptions(request);
		}

		console.log('path', path);

		// Handle WebSocket upgrade for real-time transcription (no auth required)
		const upgradeHeader = request.headers.get('upgrade')?.toLowerCase();
		if (path === '/v1/listen' && upgradeHeader === 'websocket') {
			console.log('websocket request to /v1/listen detected, bypassing auth');
			return await handleWebSocketUpgrade(request, env);
		}

		// Authenticate and get tier info for all other endpoints
		const authResult = await validateAuth(request, env);
		console.log('auth result:', { tier: authResult.tier, deviceId: authResult.deviceId });

		// Check rate limit with tier info
		const rateLimit = await checkRateLimit(request, env, authResult);
		if (!rateLimit.allowed && rateLimit.response) {
			return rateLimit.response;
		}

		// Usage status endpoint - returns current usage without incrementing
		if (path === '/v1/usage' && request.method === 'GET') {
			const status = await getUsageStatus(env, authResult.deviceId, authResult.tier);
			return addCorsHeaders(createSuccessResponse(status));
		}

		// Chat completions - main AI endpoint
		if (path === '/v1/chat/completions' && request.method === 'POST') {
			const body = (await request.json()) as RequestBody;

			// Check if model is allowed for this tier
			if (!isModelAllowed(body.model, authResult.tier)) {
				const allowedModels = TIER_CONFIG[authResult.tier].allowedModels;
				return addCorsHeaders(createErrorResponse(403, JSON.stringify({
					error: 'model_not_allowed',
					message: `Model "${body.model}" is not available for your tier (${authResult.tier}). Available models: ${allowedModels.join(', ')}`,
					tier: authResult.tier,
					allowed_models: allowedModels,
				})));
			}

			// Track usage and check daily limit (includes IP-based abuse prevention)
			const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
			const usage = await trackUsage(env, authResult.deviceId, authResult.tier, authResult.userId, ipAddress);
			if (!usage.allowed) {
				return addCorsHeaders(createErrorResponse(429, JSON.stringify({
					error: 'daily_limit_exceeded',
					message: `You've used all ${usage.limit} free AI queries for today. Resets at ${usage.resetsAt}`,
					used_today: usage.used,
					limit_today: usage.limit,
					resets_at: usage.resetsAt,
					tier: authResult.tier,
					upgrade_options: authResult.tier === 'anonymous'
						? { login: { benefit: '+25 daily queries, more models' }, subscribe: { benefit: 'Unlimited queries, all models' } }
						: { subscribe: { benefit: 'Unlimited queries, all models' } },
				})));
			}

			return await handleChatCompletions(body, env);
		}

		// Web search endpoint - uses Gemini's Google Search grounding
		if (path === '/v1/web-search' && request.method === 'POST') {
			// Track usage (counts as 1 query)
			const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
			const usage = await trackUsage(env, authResult.deviceId, authResult.tier, authResult.userId, ipAddress);
			if (!usage.allowed) {
				return addCorsHeaders(createErrorResponse(429, JSON.stringify({
					error: 'daily_limit_exceeded',
					message: `You've used all ${usage.limit} free queries for today. Resets at ${usage.resetsAt}`,
					used_today: usage.used,
					limit_today: usage.limit,
					resets_at: usage.resetsAt,
					tier: authResult.tier,
				})));
			}
			return await handleWebSearch(request, env);
		}

		if (path === '/v1/listen' && request.method === 'POST') {
			return await handleFileTranscription(request, env);
		}

		if (path === '/v1/models' && request.method === 'GET') {
			// Return tier-filtered models for non-subscribed users
			return await handleModelListing(env, authResult.tier);
		}

		if (path === '/v1/voice/transcribe' && request.method === 'POST') {
			return await handleVoiceTranscription(request, env);
		}

		if (path === '/v1/voice/query' && request.method === 'POST') {
			return await handleVoiceQuery(request, env);
		}

		if (path === '/v1/text-to-speech' && request.method === 'POST') {
			return await handleTextToSpeech(request, env);
		}

		if (path === '/v1/voice/chat' && request.method === 'POST') {
			return await handleVoiceChat(request, env);
		}

		// //TODO:
		// if (path === '/v1/tts-ws' && upgradeHeader === 'websocket') {
		// 	return await handleTTSWebSocketUpgrade(request, env);
		// }

		// Vertex AI proxy for Agent SDK
		// The Agent SDK sends requests to ANTHROPIC_VERTEX_BASE_URL/v1/messages
		if (path === '/v1/messages' && request.method === 'POST') {
			console.log('Vertex AI proxy request to /v1/messages');

			// Require authentication for Agent SDK
			if (authResult.tier === 'anonymous') {
				return addCorsHeaders(createErrorResponse(401, JSON.stringify({
					error: 'authentication_required',
					message: 'Vertex AI proxy requires authentication. Please log in to screenpipe.',
				})));
			}

			// Check model from body (clone request so proxy can still read it)
			const clonedRequest = request.clone();
			try {
				const body = (await clonedRequest.json()) as { model?: string };
				const model = body.model || 'claude-haiku-4-5-20251001';
				if (!isModelAllowed(model, authResult.tier)) {
					const allowedModels = TIER_CONFIG[authResult.tier].allowedModels;
					return addCorsHeaders(createErrorResponse(403, JSON.stringify({
						error: 'model_not_allowed',
						message: `Model "${model}" is not available for your tier (${authResult.tier}). Available models: ${allowedModels.join(', ')}`,
						tier: authResult.tier,
						allowed_models: allowedModels,
					})));
				}
			} catch (e) {
				// If body parse fails, let the proxy handle the error downstream
			}

			// Track usage and check daily limit
			const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
			const usage = await trackUsage(env, authResult.deviceId, authResult.tier, authResult.userId, ipAddress);
			if (!usage.allowed) {
				return addCorsHeaders(createErrorResponse(429, JSON.stringify({
					error: 'daily_limit_exceeded',
					message: `You've used all ${usage.limit} AI queries for today. Resets at ${usage.resetsAt}`,
					used_today: usage.used,
					limit_today: usage.limit,
					resets_at: usage.resetsAt,
					tier: authResult.tier,
				})));
			}

			return await handleVertexProxy(request, env);
		}

		// Anthropic-compatible endpoint for OpenCode integration
		// OpenCode sends requests to baseURL/v1/messages when configured with api: "anthropic"
		// Requires logged-in user (not anonymous)
		if (path === '/anthropic/v1/messages' && request.method === 'POST') {
			console.log('OpenCode Anthropic proxy request to /anthropic/v1/messages');

			// Require authentication for OpenCode
			if (authResult.tier === 'anonymous') {
				return addCorsHeaders(createErrorResponse(401, JSON.stringify({
					error: 'authentication_required',
					message: 'OpenCode requires authentication. Please log in to screenpipe.',
				})));
			}

			// Track usage for OpenCode requests
			const ipAddress = request.headers.get('cf-connecting-ip') || undefined;
			const usage = await trackUsage(env, authResult.deviceId, authResult.tier, authResult.userId, ipAddress);
			if (!usage.allowed) {
				return addCorsHeaders(createErrorResponse(429, JSON.stringify({
					error: 'daily_limit_exceeded',
					message: `You've used all ${usage.limit} AI queries for today. Resets at ${usage.resetsAt}`,
					used_today: usage.used,
					limit_today: usage.limit,
					resets_at: usage.resetsAt,
					tier: authResult.tier,
				})));
			}

			return await handleVertexProxy(request, env);
		}

		// Anthropic models endpoint for OpenCode
		if (path === '/anthropic/v1/models' && request.method === 'GET') {
			console.log('OpenCode Anthropic models request');
			return await handleVertexModels(env);
		}

		return createErrorResponse(404, 'not found');
	} catch (error: any) {
		console.error('error in fetch:', error?.message, error?.stack);
		captureException(error);
		return createErrorResponse(500, error?.message || 'an error occurred');
	} finally {
	}
}

// Wrap with Sentry for error tracking
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return wrapRequestHandler(
			{
				options: {
					dsn: env.SENTRY_DSN,
					tracesSampleRate: 0.1,
				},
				request: request as any,
				context: ctx,
			},
			() => handleRequest(request, env, ctx)
		);
	},
} satisfies ExportedHandler<Env>;

/*
terminal 1

cd packages/ai-gateway
wrangler dev


terminal 2
HOST=https://api.screenpi.pe
HOST=http://localhost:8787
TOKEN=foobar (check app settings)
in
less "$HOME/Library/Application Support/screenpipe/store.bin"


curl $HOST/test


curl -X POST $HOST/v1/listen \
  -H "Content-Type: audio/wav" \
  -H "detect_language: en" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary "@./crates/screenpipe-audio/test_data/poetic_kapil_gupta.wav"

# Test free tier (no auth)
curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "X-Device-Id: test-device-123" \
-d '{
"model": "claude-haiku-4-5-20251001",
"messages": [
	{
	"role": "user",
	"content": "Tell me a short joke."
	}
],
"stream": true
}' | while read -r line; do
echo "$line" | sed 's/^data: //g' | jq -r '.choices[0].delta.content // empty' 2>/dev/null
done | tr -d '\n'

# Check usage
curl "$HOST/v1/usage" -H "X-Device-Id: test-device-123"

curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN" \
-d '{
"model": "gpt-4o",
"messages": [
	{
	"role": "system",
	"content": "You are a helpful assistant."
	},
	{
	"role": "user",
	"content": "Tell me a short joke."
	}
],
"stream": true
}' | while read -r line; do
echo "$line" | sed 's/^data: //g' | jq -r '.choices[0].delta.content // empty' 2>/dev/null
done | tr -d '\n'

using anthropic

curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN" \
-d '{
"model": "claude-3-5-sonnet-20240620",
"messages": [
	{
	"role": "system",
	"content": "You are a helpful assistant."
	},
	{
	"role": "user",
	"content": "Tell me a short joke."
	}
],
"stream": true
}' | while read -r line; do
echo "$line" | sed 's/^data: //g' | jq -r '.choices[0].delta.content // empty' 2>/dev/null
done | tr -d '\n'

using gemini

curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN" \
-d '{
"model": "gemini-1.5-flash-latest",
"stream": true,
"messages": [
    {
        "role": "system",
        "content": "You are a helpful assistant."
    },
    {
        "role": "user",
        "content": "Tell me a short joke."
    }
]
}'

deployment

wrangler deploy

rate limit testing

# test openai endpoint (should hit limit faster)
for i in {1..25}; do
  echo "Request $i"
  curl -X POST "$HOST/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}' \
    -w "\nStatus: %{http_code}\n"
  sleep 0.1
done

*/
