import { DurableObject } from 'cloudflare:workers';
import { Langfuse } from 'langfuse-node';
import { verifyToken } from '@clerk/backend';
import { createProvider } from './providers';
import { Env, RequestBody } from './types';
import * as Sentry from '@sentry/cloudflare';

// Add cache for subscription status
class SubscriptionCache {
	private cache: Map<string, { isValid: boolean; timestamp: number }>;
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

	constructor() {
		this.cache = new Map();
	}

	get(userId: string): boolean | null {
		const entry = this.cache.get(userId);
		if (!entry) return null;

		if (Date.now() - entry.timestamp > this.CACHE_TTL) {
			this.cache.delete(userId);
			return null;
		}

		return entry.isValid;
	}

	set(userId: string, isValid: boolean) {
		this.cache.set(userId, {
			isValid,
			timestamp: Date.now(),
		});
	}
}

const subscriptionCache = new SubscriptionCache();

async function validateSubscription(env: Env, userId: string): Promise<boolean> {
	console.log('validating user id has cloud sub', userId);
	// Check cache first
	const cached = subscriptionCache.get(userId);
	if (cached !== null) {
		return cached;
	}

	// Only try Supabase if userId looks like a UUID
	const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	if (UUID_REGEX.test(userId)) {
		try {
			const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/has_active_cloud_subscription`, {
				method: 'POST',
				headers: {
					apikey: env.SUPABASE_ANON_KEY,
					Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ user_id: userId }),
			});

			if (!response.ok) {
				console.error('Supabase error:', await response.text());
				return false;
			}

			const isValid: boolean = await response.json();
			subscriptionCache.set(userId, isValid);
			return isValid;
		} catch (error) {
			console.error('Error checking subscription:', error);
			return false;
		}
	}

	// If not a UUID, return false to allow Clerk verification to proceed
	return false;
}

async function verifyClerkToken(env: Env, token: string): Promise<boolean> {
	console.log('verifying clerk token', token);
	try {
		const payload = await verifyToken(token, {
			secretKey: env.CLERK_SECRET_KEY,
		});
		return payload.sub !== null;
	} catch (error) {
		console.error('clerk verification failed:', error);
		return false;
	}
}

export class RateLimiter {
	private state: DurableObjectState;
	private requests: Map<string, { count: number; lastReset: number }>;

	constructor(state: DurableObjectState) {
		this.state = state;
		this.requests = new Map();
	}

	async fetch(request: Request) {
		const ip = request.headers.get('cf-connecting-ip') || 'unknown';
		const url = new URL(request.url);
		const now = Date.now();

		// different limits for different endpoints
		const limits: Record<string, { rpm: number; window: number }> = {
			'/v1/chat/completions': { rpm: 20, window: 60000 }, // 20 requests per minute for openai
			default: { rpm: 60, window: 60000 }, // 60 rpm for other endpoints
		};

		const limit = limits[url.pathname] || limits.default;

		// get or initialize request tracking
		let tracking = this.requests.get(ip) || { count: 0, lastReset: now };

		// reset if window expired
		if (now - tracking.lastReset > limit.window) {
			tracking = { count: 0, lastReset: now };
		}

		tracking.count++;
		this.requests.set(ip, tracking);

		const isAllowed = tracking.count <= limit.rpm;

		return new Response(
			JSON.stringify({
				allowed: isAllowed,
				remaining: Math.max(0, limit.rpm - tracking.count),
				reset_in: Math.ceil((tracking.lastReset + limit.window - now) / 1000),
			})
		);
	}
}

async function handleChatCompletions(body: RequestBody, env: Env): Promise<Response> {
	const provider = createProvider(body.model, env);
  
	if (body.stream) {
	  const stream = await provider.createStreamingCompletion(body);
	  return new Response(stream, {
		headers: {
		  'Content-Type': 'text/event-stream',
		  'Cache-Control': 'no-cache',
		  Connection: 'keep-alive',
		},
	  });
	}
  
	return await provider.createCompletion(body);
}

export default Sentry.withSentry(
	(env) => ({
		dsn: 'https://60750a679399e9d0b8631c059fb7578d@o4507617161314304.ingest.us.sentry.io/4508689350983680',
		tracesSampleRate: 0.1,
		environment: env.NODE_ENV || 'development',
	}),
	{
		/**
		 * This is the standard fetch handler for a Cloudflare Worker
		 *
		 * @param request - The request submitted to the Worker from the client
		 * @param env - The interface to reference bindings declared in wrangler.toml
		 * @param ctx - The execution context of the Worker
		 * @returns The response to be sent back to the client
		 */
		async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
			const langfuse = new Langfuse({
				publicKey: env.LANGFUSE_PUBLIC_KEY,
				secretKey: env.LANGFUSE_SECRET_KEY,
				baseUrl: 'https://us.cloud.langfuse.com',
			});

			langfuse.debug();
			langfuse.on('error', (error) => {
				console.error('langfuse error:', error);
			});

			// CORS headers
			const corsHeaders = {
				'Access-Control-Allow-Origin': '*', // Or specify your app's origin
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent',
			};

			// Handle CORS preflight requests
			if (request.method === 'OPTIONS') {
				return new Response(null, {
					headers: {
						...corsHeaders,
						// Add this line to handle preflight requests for all headers
						'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '',
					},
				});
			}

			const ip = request.headers.get('cf-connecting-ip') || 'unknown';
			const rateLimiterId = env.RATE_LIMITER.idFromName(ip);
			const rateLimiter = env.RATE_LIMITER.get(rateLimiterId);

			// Check rate limit
			const rateLimitResponse = await rateLimiter.fetch(request.url);
			const rateLimitData = (await rateLimitResponse.json()) as { allowed: boolean; remaining: number; reset_in: number };

			if (!rateLimitData.allowed) {
				return new Response(
					JSON.stringify({
						error: 'rate limit exceeded',
						retry_after: 60, // seconds
					}),
					{
						status: 429,
						headers: {
							...corsHeaders,
							'Content-Type': 'application/json',
							'Retry-After': '60',
						},
					}
				);
			}

			try {
				const url = new URL(request.url);
				const path = url.pathname;

				// Add auth check for protected routes
				if (path !== '/test') {
					const authHeader = request.headers.get('Authorization');
					if (!authHeader?.startsWith('Bearer ')) {
						return new Response(JSON.stringify({ error: 'unauthorized' }), {
							status: 401,
							headers: corsHeaders,
						});
					}

					const token = authHeader.split(' ')[1];
					// First try to validate as a user ID with subscription
					let isValid = await validateSubscription(env, token);

					// If not valid, try to verify as a Clerk token
					if (!isValid) {
						isValid = await verifyClerkToken(env, token);
					}

					if (!isValid) {
						return new Response(JSON.stringify({ error: 'invalid subscription' }), {
							status: 401,
							headers: corsHeaders,
						});
					}
				}

				if (path === '/test') {
					return new Response('ai proxy is working!', {
						status: 200,
						headers: corsHeaders,
					});
				}

			if (path === '/v1/chat/completions' && request.method === 'POST') {
				const body = (await request.json()) as RequestBody;
				const isStreaming = body.stream === true;

				const trace = langfuse.trace({
					id: 'ai_call_' + Date.now(),
					name: 'ai_call',
					metadata: {
					  model: body.model,
					  streaming: body.stream === true,
					},
				});

				try {
					const response = await handleChatCompletions(body, env);
					await trace.update({
      					metadata: {
						  completionStatus: 'success',
      					  completionTime: new Date().toISOString(),
      					  modelUsed: body.model,
      					  isStreaming: body.stream === true,
      					},
						output: response.statusText,
					});
					return response;
				  } catch (error: any) {
					await trace.update({
						metadata: {
						  completionStatus: 'error',
						  errorTime: new Date().toISOString(),
						  errorType: error.name,
						  errorMessage: error.message,
						},
						output: error.message,
					});
					throw error;
				  }
			}

				if (path === '/v1/listen' && request.method === 'POST') {
					// Get the raw body instead of form data
					const audioBuffer = await request.arrayBuffer();
					const languages = request.headers.get('detect_language')?.split(',') || [];
					const sampleRate = request.headers.get('sample_rate') || '16000';
					try {
						const deepgramResponse = await fetch(
							'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&sample_rate=' +
								sampleRate +
								(languages.length > 0 ? '&' + languages.map((lang) => `detect_language=${lang}`).join('&') : ''),
							{
								method: 'POST',
								headers: {
									Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
									'Content-Type': 'audio/wav', // Set correct content type
								},
								body: audioBuffer,
							}
						);

						if (!deepgramResponse.ok) {
							const errorData = await deepgramResponse.json();
							throw new Error(`Deepgram API error: ${JSON.stringify(errorData)}`);
						}

						const data = await deepgramResponse.json();
						return new Response(JSON.stringify(data), {
							headers: {
								...corsHeaders,
								'Content-Type': 'application/json',
							},
						});
					} catch (error: any) {
						console.error('Error in Deepgram request:', error);
						return new Response(
							JSON.stringify({
								error: error.message,
								details: error.stack,
							}),
							{
								status: 500,
								headers: {
									...corsHeaders,
									'Content-Type': 'application/json',
								},
							}
						);
					}
				}

				return new Response('not found', {
					status: 404,
					headers: corsHeaders,
				});
			} catch (error) {
				console.error('error in fetch:', error);
				return new Response('an error occurred', {
					status: 500,
					headers: corsHeaders,
				});
			} finally {
				await langfuse.shutdownAsync();
			}
		},
	} satisfies ExportedHandler<Env>
);


/*
terminal 1

cd screenpipe-actions/ai-proxy
wrangler dev


terminal 2
HOST=https://ai-proxy.i-f9f.workers.dev
HOST=http://localhost:8787
TOKEN=foobar (check app settings)

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
