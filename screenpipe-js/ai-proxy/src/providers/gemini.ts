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

	// Check if web search is requested in tools
	private hasWebSearchTool(tools?: any[]): boolean {
		if (!tools) return false;
		return tools.some(tool =>
			tool.type === 'web_search' ||
			tool.type === 'google_search' ||
			tool.googleSearch !== undefined ||
			(tool.function?.name === 'web_search') ||
			(tool.function?.name === 'google_search')
		);
	}

	private createGenerationConfig(body: RequestBody) {
		const config: any = {
		  temperature: body.temperature,
		};

		if (body.response_format?.type === 'json_schema' && body.response_format.schema) {
		  config.responseMimeType = 'application/json';
		  config.responseSchema = body.response_format.schema;
		} else if (body.response_format?.type === 'json_object') {
		  config.responseMimeType = 'application/json';
		}

		return config;
	}

	private createModelConfig(body: RequestBody) {
		const config: any = {
			model: body.model,
			generationConfig: this.createGenerationConfig(body),
		};

		// Add Google Search grounding if web_search tool is requested
		if (this.hasWebSearchTool(body.tools)) {
			console.log('[Gemini] Enabling Google Search grounding');
			config.tools = [{ googleSearch: {} }];
		}

		return config;
	}

	async createCompletion(body: RequestBody): Promise<Response> {
		const modelConfig = this.createModelConfig(body);
		this.model = this.client.getGenerativeModel(modelConfig);

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

		return new Response(JSON.stringify(this.formatResponse(response, this.hasWebSearchTool(body.tools))), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		const modelConfig = this.createModelConfig(body);
		this.model = this.client.getGenerativeModel(modelConfig);

		const chat = this.model.startChat({
			history: this.formatMessages(body.messages),
			generationConfig: {
				temperature: body.temperature,
			},
		});

		const result = await chat.sendMessage(body.messages[body.messages.length - 1].content as string);
		const hasWebSearch = this.hasWebSearchTool(body.tools);

		return new ReadableStream({
			async start(controller) {
				try {
					const response = await result.response;
					const text = response.text();

					// If web search was used, prepend sources info
					let sourcesText = '';
					if (hasWebSearch) {
						const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;
						if (groundingMetadata?.groundingChunks?.length > 0) {
							sourcesText = '\n\n---\n**Sources:**\n';
							for (const chunk of groundingMetadata.groundingChunks) {
								if (chunk.web?.uri) {
									sourcesText += `- [${chunk.web.title || chunk.web.uri}](${chunk.web.uri})\n`;
								}
							}
						}
					}

					const fullText = text + sourcesText;
					const chunkSize = 20;
					for (let i = 0; i < fullText.length; i += chunkSize) {
						const chunk = fullText.slice(i, i + chunkSize);
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

	formatResponse(response: any, includeGrounding: boolean = false): any {
		let content = response.text();

		// If grounding was used, append sources
		if (includeGrounding) {
			const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
			if (groundingMetadata?.groundingChunks?.length > 0) {
				content += '\n\n---\n**Sources:**\n';
				for (const chunk of groundingMetadata.groundingChunks) {
					if (chunk.web?.uri) {
						content += `- [${chunk.web.title || chunk.web.uri}](${chunk.web.uri})\n`;
					}
				}
			}
		}

		const result: any = {
			choices: [
				{
					message: {
						content,
						role: 'assistant',
					},
				},
			],
		};

		// Include grounding metadata in response for clients that want it
		if (includeGrounding) {
			const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
			if (groundingMetadata) {
				result.grounding_metadata = {
					search_queries: groundingMetadata.webSearchQueries || [],
					sources: (groundingMetadata.groundingChunks || []).map((chunk: any) => ({
						title: chunk.web?.title,
						url: chunk.web?.uri,
					})),
				};
			}
		}

		return result;
	}

	async listModels(): Promise<{ id: string; name: string; provider: string }[]> {
		try {
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.client.apiKey}`);

			if (!response.ok) {
				throw new Error(`Failed to fetch Gemini models: ${response.statusText}`);
			}

			const data: { models: any[] } = await response.json();
			return data.models
				.filter((model: any) => {
					// Check if model has generateContent method and is not an embedding model
					return (
						model.supportedGenerationMethods?.includes('generateContent') && !model.supportedGenerationMethods?.includes('embedContent')
					);
				})
				.map((model: any) => ({
					id: model.name.replace('models/', ''),
					name: model.displayName || model.name.replace('models/', ''),
					provider: 'google',
				}));
		} catch (error) {
			console.error('Failed to fetch Gemini models:', error);
			// Updated fallback to latest models (Jan 2026)
			return [
				{
					id: 'gemini-3-pro',
					name: 'Gemini 3 Pro',
					provider: 'google',
				},
				{
					id: 'gemini-3-flash',
					name: 'Gemini 3 Flash',
					provider: 'google',
				},
				{
					id: 'gemini-2.5-pro',
					name: 'Gemini 2.5 Pro',
					provider: 'google',
				},
				{
					id: 'gemini-2.5-flash',
					name: 'Gemini 2.5 Flash',
					provider: 'google',
				},
			];
		}
	}
}
