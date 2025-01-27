import { AIProvider } from './base';
import { Message, RequestBody, Tool, AnthropicTool } from '../types';
import Anthropic from '@anthropic-ai/sdk';
import type {
	MessageParam,
	ContentBlock,
	TextBlock,
	ImageBlockParam,
	Message as AnthropicMessage,
	ContentBlockParam,
} from '@anthropic-ai/sdk/resources';

export class AnthropicProvider implements AIProvider {
	supportsTools = true;
	supportsVision = true;
	supportsJson = true;
	private client: Anthropic;

	constructor(apiKey: string) {
		this.client = new Anthropic({ apiKey });
	}

	async createCompletion(body: RequestBody): Promise<Response> {
		const messages = this.formatMessages(body.messages);

		const response = await this.client.messages.create({
			messages,
			model: body.model,
			max_tokens: 4096,
			temperature: body.temperature,
			system: body.response_format?.type === 'json_object' ? 'Respond with valid JSON only.' : undefined,
			tools: body.tools ? this.formatTools(body.tools) : undefined,
		});

		return new Response(JSON.stringify(this.formatResponse(response)), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		const stream = await this.client.messages.create({
			messages: this.formatMessages(body.messages),
			model: body.model,
			stream: true,
			max_tokens: 4096,
			temperature: body.temperature,
		});

		return new ReadableStream({
			async start(controller) {
				try {
					for await (const chunk of stream) {
						if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({
										choices: [{ delta: { content: chunk.delta.text } }],
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

	private formatTools(tools: Tool[]): AnthropicTool[] {
		return tools.map((tool) => ({
			name: tool.function.name,
			description: tool.function.description,
			input_schema: {
				type: 'object',
				properties: tool.function.parameters.properties,
				required: tool.function.parameters.required,
				...Object.entries(tool.function.parameters)
					.filter(([key]) => !['type', 'properties', 'required'].includes(key))
					.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
			},
		}));
	}

	formatMessages(messages: Message[]): MessageParam[] {
		return messages.map((msg) => {
			const content: ContentBlockParam[] = Array.isArray(msg.content)
				? msg.content.map((part) => {
						if (part.type === 'image') {
							return {
								type: 'image',
								source: {
									type: 'base64',
									media_type: 'image/jpeg',
									data: part.image?.url || '',
								},
							} as ImageBlockParam;
						}
						return {
							type: 'text',
							text: part.text || '',
						} as TextBlock;
				  })
				: [
						{
							type: 'text',
							text: msg.content as string,
						},
				  ];

			return {
				role: msg.role === 'user' ? 'user' : 'assistant',
				content,
			};
		});
	}

	formatResponse(response: AnthropicMessage): {
		choices: Array<{
			message: {
				content: string;
				role: string;
				tool_calls?: any[];
			};
		}>;
	} {
		const textBlock = response.content.find((block): block is TextBlock => block.type === 'text');

		const textContent = textBlock?.text || '';

		return {
			choices: [
				{
					message: {
						content: textContent,
						role: 'assistant',
						tool_calls: response.content
							.filter((block): block is ContentBlock => block.type === 'tool_use')
							.map((block) => ({
								type: block.type,
								function: {
									name: (block as any).name,
									arguments: JSON.stringify((block as any).input),
								},
							})),
					},
				},
			],
		};
	}
}
