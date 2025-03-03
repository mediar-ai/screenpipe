import * as Sentry from '@sentry/cloudflare';
import { Env, RequestBody } from './types';
import { handleOptions, createSuccessResponse, createErrorResponse } from './utils/cors';
import { validateAuth } from './utils/auth';
import { RateLimiter, checkRateLimit } from './utils/rate-limiter';
import { setupAnalytics } from './services/analytics';
import { handleChatCompletions } from './handlers/chat';
import { handleModelListing } from './handlers/models';
import { handleFileTranscription, handleWebSocketUpgrade } from './handlers/transcription';
import { handleVoiceTranscription, handleVoiceQuery, handleTextToSpeech, handleVoiceChat } from './handlers/voice';
// import { handleTTSWebSocketUpgrade } from './handlers/voice-ws';

export { RateLimiter };

export default Sentry.withSentry(
	(env) => ({
		dsn: 'https://60750a679399e9d0b8631c059fb7578d@o4507617161314304.ingest.us.sentry.io/4508689350983680',
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

				const rateLimit = await checkRateLimit(request, env);
				if (!rateLimit.allowed && rateLimit.response) {
					return rateLimit.response;
				}

				const url = new URL(request.url);
				const path = url.pathname;
				console.log('path', path);

				// Handle WebSocket upgrade for real-time transcription
				const upgradeHeader = request.headers.get('upgrade')?.toLowerCase();
				if (path === '/v1/listen' && upgradeHeader === 'websocket') {
					console.log('websocket request to /v1/listen detected, bypassing auth');
					return await handleWebSocketUpgrade(request, env);
				}

				if (path !== '/test') {
				  const authResult = await validateAuth(request, env);
				  if (!authResult.isValid) {
				    return createErrorResponse(401, authResult.error || 'unauthorized');
				  }
				}

				if (path === '/test') {
					return createSuccessResponse('ai proxy is working!');
				}

				if (path === '/v1/chat/completions' && request.method === 'POST') {
					const body = (await request.json()) as RequestBody;
					return await handleChatCompletions(body, env, langfuse);
				}

				if (path === '/v1/listen' && request.method === 'POST') {
					return await handleFileTranscription(request, env);
				}

				if (path === '/v1/models' && request.method === 'GET') {
					return await handleModelListing(env);
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

				return createErrorResponse(404, 'not found');
			} catch (error) {
				console.error('error in fetch:', error);
				return createErrorResponse(500, 'an error occurred');
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
