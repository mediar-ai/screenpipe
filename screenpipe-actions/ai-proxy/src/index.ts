import { DurableObject } from 'cloudflare:workers';
import { Langfuse } from 'langfuse-node';
import { verifyToken } from '@clerk/backend';
import { Anthropic } from '@anthropic-ai/sdk';

async function verifyClerkToken(env: Env, token: string): Promise<boolean> {
	try {
		const payload = await verifyToken(token, {
				secretKey: env.CLERK_SECRET_KEY,
		});
		return !!payload.sub;
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
				const isValid = await verifyClerkToken(env, token);

				if (!isValid) {
					return new Response(JSON.stringify({ error: 'invalid token' }), {
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
				const body = (await request.json()) as {
					model: string;
					messages: any[];
					stream: boolean;
					response_format?: { type: string };
					temperature?: number;
				};
				const isStreaming = body.stream === true;
				const isAnthropicModel = body.model.toLowerCase().includes('claude');

				const trace = langfuse.trace({
					id: 'ai_call_' + Date.now(),
					name: 'ai_call',
					metadata: {
						expectJson: body.response_format?.type === 'json_object',
						streaming: isStreaming,
						provider: isAnthropicModel ? 'anthropic' : 'openai',
					},
				});

				const generation = trace.generation({
					name: 'completion',
					model: body.model,
					modelParameters: {
						temperature: body.temperature,
						streaming: isStreaming,
					},
					input: JSON.stringify(body.messages),
				});

				// Convert messages to Anthropic format if needed
				const anthropicMessages = isAnthropicModel
					? {
							messages: body.messages.map((msg) => ({
								role: msg.role === 'user' ? 'user' : 'assistant',
								content: msg.content,
							})),
							model: body.model,
							stream: isStreaming,
							temperature: body.temperature,
							max_tokens: 8192,
					  }
					: null;

				if (isStreaming) {
					const { readable, writable } = new TransformStream();
					const writer = writable.getWriter();

					ctx.waitUntil(
						(async () => {
							try {
								if (isAnthropicModel) {
									const anthropic = new Anthropic({
										apiKey: env.ANTHROPIC_API_KEY,
									});

									try {
										const stream = await anthropic.messages.create({
											messages: body.messages.map(msg => ({
													role: msg.role === 'user' ? 'user' : 'assistant',
													content: msg.content,
												})),
												model: body.model,
												stream: true,
												max_tokens: 4096,
											})

										for await (const chunk of stream) {
											if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
												const openaiChunk = {
													choices: [{
														delta: {
															content: chunk.delta.text
														}
													}]
												};
												await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
											}
										}
										
										await writer.write(new TextEncoder().encode('data: [DONE]\n\n'));
									} catch (error) {
										console.error('Error in Anthropic stream:', error);
										throw error;
									}
								} else {
									// Original OpenAI format - keep the fetch call only for OpenAI
									const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
										method: 'POST',
										headers: {
											Authorization: `Bearer ${env.OPENAI_API_KEY}`,
											'Content-Type': 'application/json',
										},
										body: JSON.stringify(body),
									});

									if (!apiResponse.ok) {
										const errorData = await apiResponse.json();
										throw new Error(`API error: ${JSON.stringify(errorData)}`);
									}

									const reader = apiResponse.body?.getReader();
									if (!reader) {
										throw new Error('Failed to get reader from API response');
									}

									while (true) {
										const { done, value } = await reader.read();
										if (done) break;
										await writer.write(value);
									}
								}

								generation.end({
									completionStartTime: new Date(),
									output: 'Streaming response completed',
								});
							} catch (error: any) {
								console.error('Error in API stream:', error);
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
						const apiResponse = await fetch(
							isAnthropicModel ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/chat/completions',
							{
								method: 'POST',
								headers: {
									...(isAnthropicModel
										? {
												'x-api-key': env.ANTHROPIC_API_KEY,
												'anthropic-version': '2023-06-01',
										  }
										: {
												Authorization: `Bearer ${env.OPENAI_API_KEY}`,
										  }),
									'Content-Type': 'application/json',
								},
								body: JSON.stringify(isAnthropicModel ? anthropicMessages : body),
							}
						);

						if (!apiResponse.ok) {
							const errorData = await apiResponse.json();
							throw new Error(`API error: ${JSON.stringify(errorData)}`);
						}

						const data = (await apiResponse.json()) as { choices: { message: { content: string } }[] };

						// Normalize Anthropic response to match OpenAI format
						const normalizedResponse = isAnthropicModel
							? {
									choices: [
										{
											message: {
												content: data.choices[0].message.content,
											},
										},
									],
							  }
							: data;

						generation.end({
							completionStartTime: new Date(),
							output: normalizedResponse.choices[0]?.message?.content,
						});

						return new Response(JSON.stringify(normalizedResponse), {
							headers: {
								...corsHeaders,
								'Content-Type': 'application/json',
							},
						});
					} catch (error: any) {
						console.error('Error in API request:', error);
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
	CLERK_SECRET_KEY: string;
}

/*
terminal 1

cd screenpipe-actions/ai-proxy
wrangler dev


terminal 2
HOST=https://ai-proxy.i-f9f.workers.dev
HOST=http://localhost:8787
TOKEN=foobar (check app settings)

curl $host/test


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
