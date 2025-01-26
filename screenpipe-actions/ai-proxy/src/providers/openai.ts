import { AIProvider } from './base';
import { RequestBody } from '../types';
import OpenAI from 'openai';
import type { ChatCompletionCreateParams } from 'openai/resources/chat';

export class OpenAIProvider implements AIProvider {
	private client: OpenAI;

	constructor(apiKey: string) {
		this.client = new OpenAI({ apiKey });
	}

	async createCompletion(body: RequestBody): Promise<Response> {
		const params: ChatCompletionCreateParams = {
			model: body.model,
			messages: this.formatMessages(body.messages),
			temperature: body.temperature,
			stream: false,
			response_format: body.response_format?.type === 'json_object' ? { type: 'json_object' } : undefined,
			tools: body.tools,
		};

		const response = await this.client.chat.completions.create(params);

		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		const stream = await this.client.chat.completions.create({
			model: body.model,
			messages: this.formatMessages(body.messages),
			temperature: body.temperature,
			stream: true,
			response_format: body.response_format,
			tools: body.tools,
		});

		return new ReadableStream({
			async start(controller) {
				try {
					for await (const chunk of stream) {
						const content = chunk.choices[0]?.delta?.content;
						if (content) {
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({
										choices: [{ delta: { content } }],
									})}\n\n`
								)
							);
						}
					}
					controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		});
	}

	formatMessages(messages: any[]): any {
		return messages;
	}
}
