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

		let requestBody = this.buildRequestBody(body, hasWebSearch);

		console.log('[Gemini Vertex] Request to:', url);

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

		let result = await response.json();

		// Check if model called web_search - if so, execute it and continue
		const parts = result.candidates?.[0]?.content?.parts || [];
		const webSearchCall = parts.find((p: any) =>
			p.functionCall?.name === 'web_search' || p.functionCall?.name === 'google_search'
		);

		if (webSearchCall) {
			const query = webSearchCall.functionCall.args?.query || webSearchCall.functionCall.args?.q || '';
			console.log('[Gemini Vertex] Model called web_search, executing for:', query);

			try {
				const searchResult = await this.executeWebSearch(query);

				// Build follow-up request with the search result
				const followUpContents = [
					...requestBody.contents,
					{
						role: 'model',
						parts: [{ functionCall: webSearchCall.functionCall }],
					},
					{
						role: 'user',
						parts: [{
							functionResponse: {
								name: 'web_search',
								response: { result: searchResult.content },
							},
						}],
					},
				];

				const followUpResponse = await fetch(url, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						contents: followUpContents,
						generationConfig: requestBody.generationConfig,
					}),
				});

				if (followUpResponse.ok) {
					result = await followUpResponse.json();
				}
			} catch (error) {
				console.error('[Gemini Vertex] Web search execution failed:', error);
				// Return the original response with the tool call
			}
		}

		return new Response(JSON.stringify(this.formatResponse(result, false)), {
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
		let pendingWebSearch: { name: string; args: any } | null = null;

		return new ReadableStream({
			async start(controller) {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							// Before closing, check if we have a pending web search to execute
							if (pendingWebSearch) {
								const query = pendingWebSearch.args?.query || pendingWebSearch.args?.q || '';
								console.log('[Gemini Vertex] Executing pending web_search:', query);

								try {
									const searchResult = await self.executeWebSearch(query);

									// Stream the search result as content
									controller.enqueue(
										new TextEncoder().encode(
											`data: ${JSON.stringify({
												choices: [{ delta: { content: '\n\n' + searchResult.content } }],
											})}\n\n`
										)
									);
								} catch (error) {
									console.error('[Gemini Vertex] Web search failed:', error);
									controller.enqueue(
										new TextEncoder().encode(
											`data: ${JSON.stringify({
												choices: [{ delta: { content: '\n\nWeb search failed. Please try again.' } }],
											})}\n\n`
										)
									);
								}
							}

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

										// Handle function calls
										if (part.functionCall) {
											const funcName = part.functionCall.name;

											// If it's web_search, save it for execution after stream ends
											if (funcName === 'web_search' || funcName === 'google_search') {
												pendingWebSearch = {
													name: funcName,
													args: part.functionCall.args || {},
												};
												console.log('[Gemini Vertex] Detected web_search call, will execute after stream');
												// Don't emit the tool call - we'll handle it ourselves
											} else {
												// For other tools, emit the tool call for client to handle
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
																			name: funcName,
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
									}

									// Check for finish reason (but don't close if we have pending web search)
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

	private buildRequestBody(body: RequestBody, _hasWebSearch: boolean): any {
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

		// Always send function declarations - let the model decide which tool to use
		// When model calls web_search, we'll execute it via Google Search grounding in a follow-up
		if (body.tools && body.tools.length > 0) {
			const functionDeclarations = this.convertToolsToGeminiFormat(body.tools);
			if (functionDeclarations.length > 0) {
				requestBody.tools = [{ functionDeclarations }];
				console.log('[Gemini Vertex] Tools available:', functionDeclarations.map(f => f.name));
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
	 * Execute a web search using Google Search grounding
	 * Called when the model decides to use the web_search tool
	 */
	async executeWebSearch(query: string): Promise<{ content: string; sources: any[] }> {
		const accessToken = await this.getAccessToken();
		const url = this.getEndpointUrl('gemini-2.0-flash', false);

		const requestBody = {
			contents: [{
				role: 'user',
				parts: [{ text: `Search the web and provide information about: ${query}` }],
			}],
			tools: [{ googleSearch: {} }],
			generationConfig: {
				temperature: 0.7,
			},
		};

		console.log('[Gemini Vertex] Executing web search for:', query);

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
			console.error('[Gemini Vertex] Web search error:', error);
			throw new Error(`Web search failed: ${response.status}`);
		}

		const result = await response.json();
		const parts = result.candidates?.[0]?.content?.parts || [];
		const groundingMetadata = result.candidates?.[0]?.groundingMetadata;

		let content = parts.map((p: any) => p.text || '').join('');

		// Append sources
		if (groundingMetadata?.groundingChunks?.length) {
			content += '\n\n**Sources:**\n';
			for (const chunk of groundingMetadata.groundingChunks) {
				if (chunk.web?.uri) {
					content += `- [${chunk.web.title || chunk.web.uri}](${chunk.web.uri})\n`;
				}
			}
		}

		const sources = (groundingMetadata?.groundingChunks || []).map((chunk: any) => ({
			title: chunk.web?.title,
			url: chunk.web?.uri,
		}));

		return { content, sources };
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
