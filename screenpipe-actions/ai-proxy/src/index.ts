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

async function callAI(body: any, env: Env, langfuse: Langfuse): Promise<Response> {
	const trace = langfuse.trace({
		id: "ai_call_" + Date.now(),
		name: "ai_call",
		metadata: { expectJson: body.response_format?.type === "json_object" }
	});

	const generation = trace.generation({
		name: "openai_completion",
		startTime: new Date(),
		model: body.model,
		modelParameters: {
			temperature: body.temperature,
			expectJson: body.response_format?.type === "json_object"
		},
		input: body.messages,
		output: null
	});

	try {
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${env.OPENAI_API_KEY}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		if (data.error) {
			generation.end({
				completionStartTime: new Date(),
				completion: data.error.message,
				endTime: new Date(),
				status: "error"
			});
			return new Response(JSON.stringify(data), { status: 400 });
		}

		generation.end({
			completionStartTime: new Date(),
			output: data.choices[0]?.message?.content,
			endTime: new Date(),
			status: "success"
		});

		return new Response(JSON.stringify(data), { 
			headers: { "Content-Type": "application/json" }
		});
	} catch (error) {
		generation.end({
			completionStartTime: new Date(),
			completion: error.message,
			endTime: new Date(),
			status: "error"
		});
		throw error;
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
	async fetch(request: Request, env: Env): Promise<Response> {
		const langfuse = new Langfuse({
			publicKey: env.LANGFUSE_PUBLIC_KEY,
			secretKey: env.LANGFUSE_SECRET_KEY,
			baseUrl: "https://us.cloud.langfuse.com"
		});

		langfuse.debug();
		langfuse.on("error", (error) => {
			console.error("langfuse error:", error);
		});

		try {
			const url = new URL(request.url);
			const path = url.pathname;

			if (path === '/test') {
				return new Response('ai proxy is working!', { status: 200 });
			}

			if (path === '/v1/chat/completions' && request.method === 'POST') {
				const body = await request.json();
				return await callAI(body, env, langfuse);
			}

			return new Response("not found", { status: 404 });
		} catch (error) {
			console.error("error in fetch:", error);
			return new Response("an error occurred", { status: 500 });
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
