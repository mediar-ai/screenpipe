import * as Sentry from '@sentry/cloudflare';
import { Env, RequestBody, AuthResult } from './types';
import { handleOptions, createSuccessResponse, createErrorResponse, addCorsHeaders } from './utils/cors';
import { validateAuth } from './utils/auth';
import { RateLimiter, checkRateLimit } from './utils/rate-limiter';
import { setupAnalytics } from './services/analytics';
import { trackUsage, getUsageStatus, isModelAllowed, TIER_CONFIG } from './services/usage-tracker';
import { handleChatCompletions } from './handlers/chat';
import { handleModelListing } from './handlers/models';
import { handleFileTranscription, handleWebSocketUpgrade } from './handlers/transcription';
import { handleVoiceTranscription, handleVoiceQuery, handleTextToSpeech, handleVoiceChat } from './handlers/voice';
import { handleVertexProxy, handleVertexModels } from './handlers/vertex-proxy';
// import { handleTTSWebSocketUpgrade } from './handlers/voice-ws';

export { RateLimiter };

export default Sentry.withSentry(
	(env) => ({
		dsn: 'https://55adeb65aab5b833e7bb21a98bf4735f@o4505591122886656.ingest.us.sentry.io/4510755394224128',
		tracesSampleRate: 0.1,
		sampleRate: 0.1,
		environment: env.NODE_ENV || 'development',
		enabled: (env.NODE_ENV || 'development') === 'production',
	}),
	{
		/**
		 * This is the standard fetch handler for a Cloudflare Worker
		 * @param request The HTTP request
		 * @param env Environment variables
		 * @param ctx Execution context
		 * @returns HTTP response
		 */
		// @ts-ignore
		async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
			const langfuse = setupAnalytics(env);

			try {
				if (request.method === 'OPTIONS') {
					return handleOptions(request);
				}

				const url = new URL(request.url);
				const path = url.pathname;
				console.log('path', path);

				// Handle WebSocket upgrade for real-time transcription (no auth required)
				const upgradeHeader = request.headers.get('upgrade')?.toLowerCase();
				if (path === '/v1/listen' && upgradeHeader === 'websocket') {
					console.log('websocket request to /v1/listen detected, bypassing auth');
					return await handleWebSocketUpgrade(request, env);
				}

				// Test endpoint - no auth required
				if (path === '/test') {
					return createSuccessResponse('ai proxy is working!');
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

					// Track usage and check daily limit
					const usage = await trackUsage(env, authResult.deviceId, authResult.tier, authResult.userId);
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

					return await handleChatCompletions(body, env, langfuse);
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
					return await handleVoiceQuery(request, env, langfuse);
				}

				if (path === '/v1/text-to-speech' && request.method === 'POST') {
					return await handleTextToSpeech(request, env, langfuse);
				}

				if (path === '/v1/voice/chat' && request.method === 'POST') {
					return await handleVoiceChat(request, env, langfuse);
				}

				// //TODO:
				// if (path === '/v1/tts-ws' && upgradeHeader === 'websocket') {
				// 	return await handleTTSWebSocketUpgrade(request, env);
				// }

				// Vertex AI proxy for Agent SDK
				// The Agent SDK sends requests to ANTHROPIC_VERTEX_BASE_URL/v1/messages
				if (path === '/v1/messages' && request.method === 'POST') {
					console.log('Vertex AI proxy request to /v1/messages');
					return await handleVertexProxy(request, env);
				}

				return createErrorResponse(404, 'not found');
			} catch (error: any) {
				console.error('error in fetch:', error?.message, error?.stack);
				return createErrorResponse(500, error?.message || 'an error occurred');
			} finally {
				await langfuse.shutdownAsync();
			}
		},
	} satisfies ExportedHandler<Env>
);

/*
terminal 1

cd screenpipe-js/ai-proxy
wrangler dev


terminal 2
HOST=https://ai-proxy.i-f9f.workers.dev
HOST=http://localhost:8787
TOKEN=foobar (check app settings)
in
less "$HOME/Library/Application Support/screenpipe/store.bin"


curl $HOST/test


curl -X POST $HOST/v1/listen \
  -H "Content-Type: audio/wav" \
  -H "detect_language: en" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary "@./screenpipe-audio/test_data/poetic_kapil_gupta.wav"

# Test free tier (no auth)
curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "X-Device-Id: test-device-123" \
-d '{
"model": "claude-haiku-4-5@20251001",
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
