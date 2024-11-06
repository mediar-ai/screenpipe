// import { DurableObject } from "cloudflare:workers";
import { Env } from './types'
import { Langfuse } from "langfuse-node";

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/** A Durable Object's behavior is defined in an exported Javascript class */
// export class MyDurableObject extends DurableObject {
// 	/**
// 	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
// 	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
// 	 *
// 	 * @param ctx - The interface for interacting with Durable Object state
// 	 * @param env - The interface to reference bindings declared in wrangler.toml
// 	 */
// 	constructor(ctx: DurableObjectState, env: Env) {
// 		super(ctx, env);
// 	}

// 	/**
// 	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
// 	 *  Object instance receives a request from a Worker via the same method invocation on the stub
// 	 *
// 	 * @param name - The name provided to a Durable Object instance from a Worker
// 	 * @returns The greeting to be sent back to the Worker
// 	 */
// 	async sayHello(name: string): Promise<string> {
// 		return `Hello, ${name}!`;
// 	}
// }

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
			baseUrl: "https://us.cloud.langfuse.com"
		});

		langfuse.debug();
		langfuse.on("error", (error) => {
			console.error("langfuse error:", error);
		});

		// CORS headers
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*", // Or specify your app's origin
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization, User-Agent",
		};

		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return new Response(null, { 
				headers: {
					...corsHeaders,
					// Add this line to handle preflight requests for all headers
					"Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "",
				}
			});
		}

		try {
			const url = new URL(request.url);
			const path = url.pathname;

			if (path === '/test') {
				return new Response('ai proxy is working!', { 
					status: 200,
					headers: corsHeaders
				});
			}

			if (path === '/v1/chat/completions' && request.method === 'POST') {
				const body = await request.json();
				const isStreaming = body.stream === true;

				const trace = langfuse.trace({
					id: "ai_call_" + Date.now(),
					name: "ai_call",
					metadata: { expectJson: body.response_format?.type === "json_object", streaming: isStreaming }
				});

				const generation = trace.generation({
					name: "openai_completion",
					startTime: new Date(),
					model: body.model,
					modelParameters: {
						temperature: body.temperature,
						expectJson: body.response_format?.type === "json_object",
						streaming: isStreaming
					},
					input: body.messages,
					output: null
				});

				if (isStreaming) {
					const { readable, writable } = new TransformStream();
					const writer = writable.getWriter();

					ctx.waitUntil((async () => {
						try {
							const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
								method: "POST",
								headers: {
									"Authorization": `Bearer ${env.OPENAI_API_KEY}`,
									"Content-Type": "application/json",
								},
								body: JSON.stringify(body),
							});

							if (!openaiResponse.ok) {
								const errorData = await openaiResponse.json();
								throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
							}

							const reader = openaiResponse.body?.getReader();
							if (!reader) {
								throw new Error("Failed to get reader from OpenAI response");
							}

							while (true) {
								const { done, value } = await reader.read();
								if (done) break;
								await writer.write(value);
							}

							generation.end({
								completionStartTime: new Date(),
								output: "Streaming response completed",
								endTime: new Date(),
								status: "success"
							});
						} catch (error) {
							console.error("Error in OpenAI stream:", error);
							generation.end({
								completionStartTime: new Date(),
								completion: error.message,
								endTime: new Date(),
								status: "error"
							});
							await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
						} finally {
							await writer.close();
						}
					})());

					return new Response(readable, { 
						headers: { 
							...corsHeaders,
							"Content-Type": "text/event-stream",
							"Cache-Control": "no-cache",
							"Connection": "keep-alive"
						}
					});
				} else {
					// Non-streaming response
					try {
						const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
							method: "POST",
							headers: {
								"Authorization": `Bearer ${env.OPENAI_API_KEY}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify(body),
						});

						if (!openaiResponse.ok) {
							const errorData = await openaiResponse.json();
							throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
						}

						const data = await openaiResponse.json();

						generation.end({
							completionStartTime: new Date(),
							output: data.choices[0]?.message?.content,
							endTime: new Date(),
							status: "success"
						});

						return new Response(JSON.stringify(data), { 
							headers: { 
								...corsHeaders,
								"Content-Type": "application/json"
							}
						});
					} catch (error) {
						console.error("Error in OpenAI request:", error);
						generation.end({
							completionStartTime: new Date(),
							completion: error.message,
							endTime: new Date(),
							status: "error"
						});
						return new Response(JSON.stringify({ error: error.message }), { 
							status: 500,
							headers: { 
								...corsHeaders,
								"Content-Type": "application/json"
							}
						});
					}
				}
			}

			return new Response("not found", { 
				status: 404,
				headers: corsHeaders
			});
		} catch (error) {
			console.error("error in fetch:", error);
			return new Response("an error occurred", { 
				status: 500,
				headers: corsHeaders
			});
		} finally {
			await langfuse.shutdownAsync();
		}
	}
} satisfies ExportedHandler<Env>;

interface Env {
	OPENAI_API_KEY: string;
	LANGFUSE_PUBLIC_KEY: string;
	LANGFUSE_SECRET_KEY: string;
	ANTHROPIC_API_KEY: string;
}

// test
// curl -X POST https://ai-proxy.i-f9f.workers.dev/v1/chat/completions \
//   -H "Content-Type: application/json" \
//   -H "Authorization: Bearer YOUR_API_KEY" \
//   -d '{
//     "model": "gpt-4o",
//     "messages": [
//       {
//         "role": "system",
//         "content": "You are a helpful assistant."
//       },
//       {
//         "role": "user",
//         "content": "Tell me a short joke."
//       }
//     ],
//     "stream": true
//   }' | while read -r line; do
//     echo "$line" | sed 's/^data: //g' | jq -r '.choices[0].delta.content // empty' 2>/dev/null
//   done | tr -d '\n'
