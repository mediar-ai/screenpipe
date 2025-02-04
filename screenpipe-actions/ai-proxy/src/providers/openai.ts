import { AIProvider } from './base';
import { Message, RequestBody } from '../types';
import OpenAI from 'openai';
import type { ChatCompletionMessage, ChatCompletionCreateParams } from 'openai/resources/chat';

export class OpenAIProvider implements AIProvider {
	supportsTools = true;
	supportsVision = true;
	supportsJson = true;
	private client: OpenAI;

	constructor(apiKey: string) {
		this.client = new OpenAI({ apiKey });
	}

	async createCompletion(body: RequestBody): Promise<Response> {
		const messages = this.formatMessages(body.messages);

		const params: ChatCompletionCreateParams = {
			model: body.model,
			messages,
			temperature: body.temperature,
			stream: false,
			response_format: body.response_format?.type === 'json_object' ? { type: 'json_object' } : undefined,
			tools: body.tools as ChatCompletionCreateParams['tools'],
			tool_choice: body.tool_choice as ChatCompletionCreateParams['tool_choice'],
		};

		const response = await this.client.chat.completions.create(params);
		return new Response(JSON.stringify(this.formatResponse(response)), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		const stream = await this.client.chat.completions.create({
			model: body.model,
			messages: this.formatMessages(body.messages),
			temperature: body.temperature,
			stream: true,
			response_format: body.response_format?.type === 'json_object' ? { type: 'json_object' } : undefined,
			tools: body.tools as ChatCompletionCreateParams['tools'],
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

	formatMessages(messages: Message[]): ChatCompletionMessage[] {
		return messages.map(
			(msg) =>
				({
					role: msg.role,
					content: Array.isArray(msg.content)
						? msg.content.map((part) => {
								if (part.type === 'image') {
									return {
										type: 'image_url',
										image_url: {
											url: part.image?.url,
											detail: 'auto',
										},
									};
								}
								return { type: 'text', text: part.text || '' };
						  })
						: msg.content,
					tool_calls: msg.tool_calls,
					name: msg.name,
					refusal: null,
				} as ChatCompletionMessage)
		);
	}

	formatResponse(response: any): any {
		return {
			choices: [
				{
					message: {
						content: response.choices[0].message.content,
						role: 'assistant',
						tool_calls: response.choices[0].message.tool_calls,
					},
				},
			],
		};
	}
}
