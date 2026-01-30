import { AIProvider } from './base';
import { Message, RequestBody } from '../types';

// Service account credentials structure (shared with vertex.ts)
interface ServiceAccountCredentials {
	type: string;
	project_id: string;
	private_key_id: string;
	private_key: string;
	client_email: string;
	client_id: string;
	auth_uri: string;
	token_uri: string;
	auth_provider_x509_cert_url: string;
	client_x509_cert_url: string;
}

// Cache for access tokens
interface TokenCache {
	accessToken: string;
	expiresAt: number;
}

let geminiTokenCache: TokenCache | null = null;

export class GeminiProvider implements AIProvider {
	supportsTools = true;
	supportsVision = true;
	supportsJson = true;

	private credentials: ServiceAccountCredentials;
	private projectId: string;
	private region: string;

	constructor(serviceAccountJson: string, projectId: string, region: string = 'us-central1') {
		this.credentials = JSON.parse(serviceAccountJson);
		this.projectId = projectId || this.credentials.project_id;
		this.region = region;
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

	/**
	 * Generate a JWT for service account authentication
	 */
	private async generateJWT(): Promise<string> {
		const header = {
			alg: 'RS256',
			typ: 'JWT',
		};

		const now = Math.floor(Date.now() / 1000);
		const payload = {
			iss: this.credentials.client_email,
			sub: this.credentials.client_email,
			aud: 'https://oauth2.googleapis.com/token',
			iat: now,
			exp: now + 3600, // 1 hour
			scope: 'https://www.googleapis.com/auth/cloud-platform',
		};

		const encodedHeader = this.base64urlEncode(JSON.stringify(header));
		const encodedPayload = this.base64urlEncode(JSON.stringify(payload));
		const signatureInput = `${encodedHeader}.${encodedPayload}`;

		const signature = await this.signWithRSA(signatureInput, this.credentials.private_key);
		return `${signatureInput}.${signature}`;
	}

	private base64urlEncode(str: string): string {
		const base64 = btoa(str);
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	private async signWithRSA(data: string, privateKeyPem: string): Promise<string> {
		const pemContents = privateKeyPem
			.replace('-----BEGIN PRIVATE KEY-----', '')
			.replace('-----END PRIVATE KEY-----', '')
			.replace(/\n/g, '');

		const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

		const cryptoKey = await crypto.subtle.importKey(
			'pkcs8',
			binaryKey,
			{
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256',
			},
			false,
			['sign']
		);

		const encoder = new TextEncoder();
		const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(data));

		const signatureArray = new Uint8Array(signature);
		const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
		return signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	private async getAccessToken(): Promise<string> {
		// Check cache
		if (geminiTokenCache && geminiTokenCache.expiresAt > Date.now() + 60000) {
			return geminiTokenCache.accessToken;
		}

		const jwt = await this.generateJWT();

		const response = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion: jwt,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get access token: ${error}`);
		}

		const data = (await response.json()) as { access_token: string; expires_in: number };

		geminiTokenCache = {
			accessToken: data.access_token,
			expiresAt: Date.now() + data.expires_in * 1000,
		};

		return data.access_token;
	}

	private getEndpointUrl(model: string, streaming: boolean = false): string {
		const method = streaming ? 'streamGenerateContent' : 'generateContent';
		// Map model names to Vertex AI format
		const vertexModel = this.mapModelToVertex(model);
		return `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models/${vertexModel}:${method}`;
	}

	private mapModelToVertex(model: string): string {
		// Map common model names to Vertex AI format
		const modelMap: Record<string, string> = {
			'gemini-3-flash': 'gemini-2.0-flash',
			'gemini-3-pro': 'gemini-2.0-pro-exp-02-05',
			'gemini-2.5-flash': 'gemini-2.0-flash',
			'gemini-2.5-pro': 'gemini-2.0-pro-exp-02-05',
		};
		return modelMap[model] || model;
	}

	async createCompletion(body: RequestBody): Promise<Response> {
		const accessToken = await this.getAccessToken();
		const url = this.getEndpointUrl(body.model, false);
		const hasWebSearch = this.hasWebSearchTool(body.tools);

		const requestBody = this.buildRequestBody(body, hasWebSearch);

		console.log('[Gemini Vertex] Request to:', url);
		if (hasWebSearch) {
			console.log('[Gemini Vertex] Web search grounding enabled');
		}

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('[Gemini Vertex] Error:', error);
			throw new Error(`Gemini Vertex AI request failed: ${response.status} ${error}`);
		}

		const result = await response.json();
		return new Response(JSON.stringify(this.formatResponse(result, hasWebSearch)), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		const accessToken = await this.getAccessToken();
		const url = this.getEndpointUrl(body.model, true) + '?alt=sse';
		const hasWebSearch = this.hasWebSearchTool(body.tools);

		const requestBody = this.buildRequestBody(body, hasWebSearch);

		console.log('[Gemini Vertex] Streaming request to:', url);

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('[Gemini Vertex] Streaming error:', error);
			throw new Error(`Gemini Vertex AI streaming request failed: ${response.status} ${error}`);
		}

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		const self = this;

		let toolCallIndex = 0;

		return new ReadableStream({
			async start(controller) {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
							controller.close();
							return;
						}

						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split('\n');
						buffer = lines.pop() || '';

						for (const line of lines) {
							if (line.startsWith('data: ')) {
								try {
									const data = JSON.parse(line.slice(6));
									const parts = data.candidates?.[0]?.content?.parts || [];

									for (const part of parts) {
										// Handle text content
										if (part.text) {
											controller.enqueue(
												new TextEncoder().encode(
													`data: ${JSON.stringify({
														choices: [{ delta: { content: part.text } }],
													})}\n\n`
												)
											);
										}

										// Handle function calls - convert to OpenAI streaming format
										if (part.functionCall) {
											const toolCallId = `call_${Date.now()}_${toolCallIndex}`;
											controller.enqueue(
												new TextEncoder().encode(
													`data: ${JSON.stringify({
														choices: [{
															delta: {
																tool_calls: [{
																	index: toolCallIndex,
																	id: toolCallId,
																	type: 'function',
																	function: {
																		name: part.functionCall.name,
																		arguments: JSON.stringify(part.functionCall.args || {}),
																	},
																}],
															},
														}],
													})}\n\n`
												)
											);
											toolCallIndex++;
										}
									}

									// Check for grounding metadata at the end
									if (hasWebSearch && data.candidates?.[0]?.groundingMetadata) {
										const sourcesText = self.formatGroundingSources(data.candidates[0].groundingMetadata);
										if (sourcesText) {
											controller.enqueue(
												new TextEncoder().encode(
													`data: ${JSON.stringify({
														choices: [{ delta: { content: sourcesText } }],
													})}\n\n`
												)
											);
										}
									}

									// Check for finish reason
									const finishReason = data.candidates?.[0]?.finishReason;
									if (finishReason) {
										const mappedReason = finishReason === 'STOP' ? 'stop' :
											finishReason === 'MAX_TOKENS' ? 'length' :
											finishReason === 'TOOL_USE' ? 'tool_calls' : 'stop';
										controller.enqueue(
											new TextEncoder().encode(
												`data: ${JSON.stringify({
													choices: [{ delta: {}, finish_reason: mappedReason }],
												})}\n\n`
											)
										);
									}
								} catch (e) {
									// Skip invalid JSON
								}
							}
						}
					}
				} catch (error) {
					console.error('[Gemini Vertex] Stream error:', error);
					controller.error(error);
				}
			},
		});
	}

	private buildRequestBody(body: RequestBody, hasWebSearch: boolean): any {
		const contents = this.formatMessages(body.messages);

		const requestBody: any = {
			contents,
			generationConfig: {
				temperature: body.temperature ?? 0.7,
			},
		};

		// Add response format if specified
		if (body.response_format?.type === 'json_schema' && body.response_format.schema) {
			requestBody.generationConfig.responseMimeType = 'application/json';
			requestBody.generationConfig.responseSchema = body.response_format.schema;
		} else if (body.response_format?.type === 'json_object') {
			requestBody.generationConfig.responseMimeType = 'application/json';
		}

		// Build tools - Vertex AI Gemini doesn't support mixing function tools with Google Search
		// Strategy: Detect user intent from the last message to decide which mode to use
		const lastUserMessage = body.messages.filter(m => m.role === 'user').pop();
		const userQuery = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content.toLowerCase() : '';

		// Check if user explicitly wants web/internet search
		const wantsWebSearch = hasWebSearch && (
			userQuery.includes('internet') ||
			userQuery.includes('web search') ||
			userQuery.includes('search the web') ||
			userQuery.includes('search online') ||
			userQuery.includes('latest news') ||
			userQuery.includes('current news') ||
			userQuery.includes('recent news') ||
			userQuery.includes('what is happening') ||
			userQuery.includes('today\'s') ||
			userQuery.includes('this week')
		);

		if (wantsWebSearch) {
			// User explicitly wants web search - use Google Search grounding
			requestBody.tools = [{ googleSearch: {} }];
			console.log('[Gemini Vertex] User requested web search, using Google Search grounding');
		} else if (body.tools && body.tools.length > 0) {
			// Use function declarations for local search
			const functionDeclarations = this.convertToolsToGeminiFormat(body.tools);
			if (functionDeclarations.length > 0) {
				requestBody.tools = [{ functionDeclarations }];
				console.log('[Gemini Vertex] Using function declarations:', functionDeclarations.map(f => f.name));
			}
		}

		return requestBody;
	}

	/**
	 * Convert OpenAI-style function tools to Gemini functionDeclarations format
	 */
	private convertToolsToGeminiFormat(tools: any[]): any[] {
		const functionDeclarations: any[] = [];

		for (const tool of tools) {
			// Skip web_search - it's handled via Google Search grounding
			if (tool.type === 'web_search' ||
				tool.type === 'google_search' ||
				tool.function?.name === 'web_search' ||
				tool.function?.name === 'google_search') {
				continue;
			}

			// Convert OpenAI function format to Gemini format
			if (tool.type === 'function' && tool.function) {
				functionDeclarations.push({
					name: tool.function.name,
					description: tool.function.description || '',
					parameters: this.convertParametersToGeminiSchema(tool.function.parameters),
				});
			}
		}

		return functionDeclarations;
	}

	/**
	 * Convert OpenAI JSON Schema parameters to Gemini schema format
	 */
	private convertParametersToGeminiSchema(params: any): any {
		if (!params) return { type: 'OBJECT', properties: {} };

		const converted: any = {
			type: (params.type || 'object').toUpperCase(),
		};

		if (params.properties) {
			converted.properties = {};
			for (const [key, value] of Object.entries(params.properties as Record<string, any>)) {
				converted.properties[key] = {
					type: (value.type || 'string').toUpperCase(),
					description: value.description || '',
				};
				// Handle enum
				if (value.enum) {
					converted.properties[key].enum = value.enum;
				}
			}
		}

		if (params.required && Array.isArray(params.required)) {
			converted.required = params.required;
		}

		return converted;
	}

	formatMessages(messages: Message[]): any[] {
		const formatted: any[] = [];

		for (const msg of messages) {
			if (msg.role === 'system') {
				// Gemini doesn't have a system role, prepend to first user message
				continue;
			}

			// Handle tool results - convert to Gemini functionResponse format
			if (msg.role === 'tool') {
				const toolMsg = msg as any;
				formatted.push({
					role: 'user',
					parts: [{
						functionResponse: {
							name: toolMsg.name || 'unknown_function',
							response: {
								result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
							},
						},
					}],
				});
				continue;
			}

			const role = msg.role === 'assistant' ? 'model' : 'user';
			const parts: any[] = [];

			// Handle text content
			if (typeof msg.content === 'string') {
				parts.push({ text: msg.content });
			} else if (Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === 'text') {
						parts.push({ text: part.text || '' });
					} else if (part.type === 'image_url' && part.image_url?.url) {
						// Handle OpenAI vision format (image_url with base64 or URL)
						const url = part.image_url.url;
						const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
						if (dataUrlMatch) {
							parts.push({
								inlineData: {
									mimeType: dataUrlMatch[1],
									data: dataUrlMatch[2],
								},
							});
						} else {
							// Handle external URLs
							parts.push({
								fileData: {
									mimeType: 'image/jpeg', // Default, Gemini will detect
									fileUri: url,
								},
							});
						}
					} else if (part.type === 'image' && part.image?.url) {
						// Legacy format support
						const url = part.image.url;
						const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
						if (dataUrlMatch) {
							parts.push({
								inlineData: {
									mimeType: dataUrlMatch[1],
									data: dataUrlMatch[2],
								},
							});
						}
					}
				}
			}

			// Handle assistant messages with tool calls - convert to Gemini functionCall format
			if (msg.role === 'assistant' && (msg as any).tool_calls) {
				for (const toolCall of (msg as any).tool_calls) {
					parts.push({
						functionCall: {
							name: toolCall.function?.name || toolCall.name,
							args: typeof toolCall.function?.arguments === 'string'
								? JSON.parse(toolCall.function.arguments)
								: toolCall.function?.arguments || {},
						},
					});
				}
			}

			if (parts.length > 0) {
				formatted.push({ role, parts });
			}
		}

		// Handle system message by prepending to first user message
		const systemMsg = messages.find(m => m.role === 'system');
		if (systemMsg && formatted.length > 0 && formatted[0].role === 'user') {
			const systemText = typeof systemMsg.content === 'string' ? systemMsg.content : '';
			if (systemText) {
				formatted[0].parts.unshift({ text: `System: ${systemText}\n\n` });
			}
		}

		return formatted;
	}

	private formatGroundingSources(groundingMetadata: any): string {
		if (!groundingMetadata?.groundingChunks?.length) return '';

		let sourcesText = '\n\n---\n**Sources:**\n';
		for (const chunk of groundingMetadata.groundingChunks) {
			if (chunk.web?.uri) {
				sourcesText += `- [${chunk.web.title || chunk.web.uri}](${chunk.web.uri})\n`;
			}
		}
		return sourcesText;
	}

	formatResponse(response: any, includeGrounding: boolean = false): any {
		const parts = response.candidates?.[0]?.content?.parts || [];

		// Extract text content
		let content = '';
		const toolCalls: any[] = [];

		for (const part of parts) {
			if (part.text) {
				content += part.text;
			}
			// Handle Gemini function calls - convert to OpenAI format
			if (part.functionCall) {
				toolCalls.push({
					id: `call_${Date.now()}_${toolCalls.length}`,
					type: 'function',
					function: {
						name: part.functionCall.name,
						arguments: JSON.stringify(part.functionCall.args || {}),
					},
				});
			}
		}

		// If grounding was used, append sources
		if (includeGrounding) {
			const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
			content += this.formatGroundingSources(groundingMetadata);
		}

		const message: any = {
			content: content || null,
			role: 'assistant',
		};

		// Add tool_calls if any function calls were made
		if (toolCalls.length > 0) {
			message.tool_calls = toolCalls;
		}

		const result: any = {
			choices: [{ message }],
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
		// Return available Gemini models on Vertex AI
		return [
			{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
			{ id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro', provider: 'google' },
			{ id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'google' },
			{ id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'google' },
		];
	}
}
