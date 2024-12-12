import { DurableObject } from 'cloudflare:workers';
import { Env } from './types';
import { Langfuse } from 'langfuse-node';

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

export default {
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

			if (path === '/test') {
				return new Response('ai proxy is working!', {
					status: 200,
					headers: corsHeaders,
				});
			}

			if (path === '/v1/chat/completions' && request.method === 'POST') {
				const body = (await request.json()) as {
					model: string;
					messages: any[];
					stream: boolean;
					response_format?: { type: string };
					temperature?: number;
				};
				const isStreaming = body.stream === true;

				const trace = langfuse.trace({
					id: 'ai_call_' + Date.now(),
					name: 'ai_call',
					metadata: { expectJson: body.response_format?.type === 'json_object', streaming: isStreaming },
				});

				const generation = trace.generation({
					name: 'openai_completion',
					startTime: new Date(),
					model: body.model,
					modelParameters: {
						temperature: body.temperature,
						expectJson: body.response_format?.type === 'json_object',
						streaming: isStreaming,
					},
					input: body.messages,
					output: null,
				});

				if (isStreaming) {
					const { readable, writable } = new TransformStream();
					const writer = writable.getWriter();

					ctx.waitUntil(
						(async () => {
							try {
								const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
									method: 'POST',
									headers: {
										Authorization: `Bearer ${env.OPENAI_API_KEY}`,
										'Content-Type': 'application/json',
									},
									body: JSON.stringify(body),
								});

								if (!openaiResponse.ok) {
									const errorData = await openaiResponse.json();
									throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
								}

								const reader = openaiResponse.body?.getReader();
								if (!reader) {
									throw new Error('Failed to get reader from OpenAI response');
								}

								while (true) {
									const { done, value } = await reader.read();
									if (done) break;
									await writer.write(value);
								}

								generation.end({
									completionStartTime: new Date(),
									output: 'Streaming response completed',
								});
							} catch (error: any) {
								console.error('Error in OpenAI stream:', error);
								generation.end({
									completionStartTime: new Date(),
									output: error.message,
								});
								await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
							} finally {
								await writer.close();
							}
						})()
					);

					return new Response(readable, {
						headers: {
							...corsHeaders,
							'Content-Type': 'text/event-stream',
							'Cache-Control': 'no-cache',
							Connection: 'keep-alive',
						},
					});
				} else {
					// Non-streaming response
					try {
						const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
							method: 'POST',
							headers: {
								Authorization: `Bearer ${env.OPENAI_API_KEY}`,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify(body),
						});

						if (!openaiResponse.ok) {
							const errorData = await openaiResponse.json();
							throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
						}

						const data = (await openaiResponse.json()) as { choices: { message: { content: string } }[] };

						generation.end({
							completionStartTime: new Date(),
							output: data.choices[0]?.message?.content,
						});

						return new Response(JSON.stringify(data), {
							headers: {
								...corsHeaders,
								'Content-Type': 'application/json',
							},
						});
					} catch (error: any) {
						console.error('Error in OpenAI request:', error);
						generation.end({
							completionStartTime: new Date(),
							output: error.message,
						});
						return new Response(JSON.stringify({ error: error.message }), {
							status: 500,
							headers: {
								...corsHeaders,
								'Content-Type': 'application/json',
							},
						});
					}
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
} satisfies ExportedHandler<Env>;

interface Env {
	OPENAI_API_KEY: string;
	LANGFUSE_PUBLIC_KEY: string;
	LANGFUSE_SECRET_KEY: string;
	ANTHROPIC_API_KEY: string;
	DEEPGRAM_API_KEY: string;
	RATE_LIMITER: DurableObjectNamespace;
}

/*
terminal 1

cd screenpipe-actions/ai-proxy
wrangler dev


terminal 2
HOST=https://ai-proxy.i-f9f.workers.dev
HOST=http://localhost:8787

curl $host/test


curl -X POST $HOST/v1/listen \
  -H "Content-Type: audio/wav" \
  -H "detect_language: en" \
  --data-binary "@./screenpipe-audio/test_data/poetic_kapil_gupta.wav"

curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer YOUR_API_KEY" \
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
