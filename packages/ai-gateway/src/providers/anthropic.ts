import { AIProvider } from './base';
import { Message, RequestBody, Tool, AnthropicTool, ResponseFormat } from '../types';
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
			system: this.createSystemPrompt(body.response_format),
			tools: body.tools ? this.formatTools(body.tools) : undefined,
		});

		return new Response(JSON.stringify(this.formatResponse(response)), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	private createSystemPrompt(responseFormat?: ResponseFormat): string | undefined {
		if (!responseFormat) return undefined;
	
		switch (responseFormat.type) {
		  case 'json_object':
			return 'Respond with valid JSON only.';
		  case 'json_schema':
			if (!responseFormat.schema) return undefined;
			
			return `Respond with valid JSON that strictly follows this schema:
	${JSON.stringify(responseFormat.schema, null, 2)}
	Do not include any explanatory text - output valid JSON only.`;
		  default:
			return undefined;
		}
	  }

	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		const stream = await this.client.messages.create({
			messages: this.formatMessages(body.messages),
			model: body.model,
			stream: true,
			max_tokens: 4096,
			temperature: body.temperature,
			tools: body.tools ? this.formatTools(body.tools) : undefined,
		});

		return new ReadableStream({
			async start(controller) {
				try {
					let currentToolCall: { index: number; id: string; name: string; arguments: string } | null = null;
					let toolCallIndex = 0;

					for await (const chunk of stream) {
						// Handle text content
						if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({
										choices: [{ delta: { content: chunk.delta.text } }],
									})}\n\n`
								)
							);
						}

						// Handle tool use start
						if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
							currentToolCall = {
								index: toolCallIndex,
								id: chunk.content_block.id,
								name: chunk.content_block.name,
								arguments: '',
							};
							// Send tool call start in OpenAI format
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({
										choices: [{
											delta: {
												tool_calls: [{
													index: toolCallIndex,
													id: chunk.content_block.id,
													type: 'function',
													function: {
														name: chunk.content_block.name,
														arguments: '',
													},
												}],
											},
										}],
									})}\n\n`
								)
							);
						}

						// Handle tool use input delta
						if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'input_json_delta' && currentToolCall) {
							currentToolCall.arguments += chunk.delta.partial_json;
							controller.enqueue(
								new TextEncoder().encode(
									`data: ${JSON.stringify({
										choices: [{
											delta: {
												tool_calls: [{
													index: currentToolCall.index,
													function: {
														arguments: chunk.delta.partial_json,
													},
												}],
											},
										}],
									})}\n\n`
								)
							);
						}

						// Handle tool use end
						if (chunk.type === 'content_block_stop' && currentToolCall) {
							toolCallIndex++;
							currentToolCall = null;
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
			input_schema: tool.function.parameters,
		}));
	}

	formatMessages(messages: Message[]): MessageParam[] {
		return messages.map((msg) => {
			const content: ContentBlockParam[] = Array.isArray(msg.content)
				? msg.content.map((part) => {
						// Handle OpenAI vision format (image_url)
						if (part.type === 'image_url' && part.image_url?.url) {
							const url = part.image_url.url;
							const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
							if (dataUrlMatch) {
								return {
									type: 'image',
									source: {
										type: 'base64',
										media_type: dataUrlMatch[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
										data: dataUrlMatch[2],
									},
								} as ImageBlockParam;
							}
							// For non-base64 URLs, Anthropic requires base64 so we can't support external URLs directly
							return {
								type: 'text',
								text: `[Image URL: ${url}]`,
							} as TextBlock;
						}
						// Legacy format support
						if (part.type === 'image' && part.image?.url) {
							const url = part.image.url;
							const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
							if (dataUrlMatch) {
								return {
									type: 'image',
									source: {
										type: 'base64',
										media_type: dataUrlMatch[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
										data: dataUrlMatch[2],
									},
								} as ImageBlockParam;
							}
							return {
								type: 'image',
								source: {
									type: 'base64',
									media_type: 'image/jpeg',
									data: url,
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

	async listModels(): Promise<{ id: string; name: string; provider: string }[]> {
		try {
			const response = await this.client.models.list();
			return response.data.map((model) => ({
				id: model.id,
				name: model.display_name,
				provider: 'anthropic',
			}));
		} catch (error) {
			console.error('Failed to fetch Anthropic models:', error);
			// Fallback to latest models (Jan 2026)
			return [
				{
					id: 'claude-opus-4-5-20250514',
					name: 'Claude Opus 4.5',
					provider: 'anthropic',
				},
				{
					id: 'claude-sonnet-4-5-20250514',
					name: 'Claude Sonnet 4.5',
					provider: 'anthropic',
				},
				{
					id: 'claude-haiku-4-5-20250514',
					name: 'Claude Haiku 4.5',
					provider: 'anthropic',
				},
			];
		}
	}
}
