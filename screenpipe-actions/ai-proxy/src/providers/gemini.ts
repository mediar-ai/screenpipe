import { AIProvider } from './base';
import { Message, RequestBody } from '../types';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export class GeminiProvider implements AIProvider {
	supportsTools = true;
	supportsVision = true;
	supportsJson = true;
	private client: GoogleGenerativeAI;
	private model!: GenerativeModel;

	constructor(apiKey: string) {
		this.client = new GoogleGenerativeAI(apiKey);
	}

	async createCompletion(body: RequestBody): Promise<Response> {
		this.model = this.client.getGenerativeModel({ model: body.model });

		const chat = this.model.startChat({
			history: this.formatMessages(body.messages),
			generationConfig: {
				temperature: body.temperature,
			},
		});

		const prompt =
			body.response_format?.type === 'json_object'
				? `${body.messages[body.messages.length - 1].content}\nRespond with valid JSON only.`
				: (body.messages[body.messages.length - 1].content as string);

		const result = await chat.sendMessage(prompt);
		const response = await result.response;

		return new Response(JSON.stringify(this.formatResponse(response)), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		this.model = this.client.getGenerativeModel({ model: body.model });

		const chat = this.model.startChat({
			history: this.formatMessages(body.messages),
			generationConfig: {
				temperature: body.temperature,
			},
		});

		const result = await chat.sendMessage(body.messages[body.messages.length - 1].content as string);

		return new ReadableStream({
			async start(controller) {
				try {
					const response = await result.response;
					const text = response.text();

					const chunkSize = 20;
					for (let i = 0; i < text.length; i += chunkSize) {
						const chunk = text.slice(i, i + chunkSize);
						controller.enqueue(
							new TextEncoder().encode(
								`data: ${JSON.stringify({
									choices: [{ delta: { content: chunk } }],
								})}\n\n`
							)
						);
						await new Promise((resolve) => setTimeout(resolve, 10));
					}

					controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		});
	}

	formatMessages(messages: Message[]): any[] {
		return messages.map((msg) => ({
			role: this.mapRole(msg.role),
			parts: Array.isArray(msg.content)
				? msg.content.map((part) => {
						if (part.type === 'image') {
							return {
								inlineData: {
									mimeType: 'image/jpeg',
									data: part.image?.url,
								},
							};
						}
						return { text: part.text || '' };
				  })
				: [{ text: msg.content as string }],
		}));
	}

	private mapRole(role: string): string {
		switch (role) {
			case 'user':
				return 'user';
			case 'assistant':
				return 'model';
			case 'system':
				return 'user';
			default:
				return 'user';
		}
	}

	formatResponse(response: any): any {
		return {
			choices: [
				{
					message: {
						content: response.text(),
						role: 'assistant',
					},
				},
			],
		};
	}
}
