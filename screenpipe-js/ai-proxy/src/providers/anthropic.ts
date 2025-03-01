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
			input_schema: tool.function.parameters,
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
			// Fallback to known models if API fails
			return [
				{
					id: 'claude-3-5-sonnet-latest',
					name: 'Claude 3.5 Sonnet',
					provider: 'anthropic',
				},
				{
					id: 'claude-3-5-haiku-latest',
					name: 'Claude 3.5 Haiku',
					provider: 'anthropic',
				},
			];
		}
	}
}
