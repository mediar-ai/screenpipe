/**
 * Vertex AI Provider for proxying Claude requests to Google Cloud Vertex AI
 *
 * This provider allows the Agent SDK to use Vertex AI Claude models without
 * requiring users to set up GCP credentials themselves.
 */

import { AIProvider } from './base';
import { RequestBody } from '../types';

// Service account credentials structure
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

let tokenCache: TokenCache | null = null;

export class VertexAIProvider implements AIProvider {
	supportsTools = true;
	supportsVision = true;
	supportsJson = true;

	private credentials: ServiceAccountCredentials;
	private projectId: string;
	private region: string;

	constructor(serviceAccountJson: string, projectId: string, region: string = 'us-east5') {
		this.credentials = JSON.parse(serviceAccountJson);
		this.projectId = projectId || this.credentials.project_id;
		this.region = region;
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

	/**
	 * Base64URL encode a string
	 */
	private base64urlEncode(str: string): string {
		const base64 = btoa(str);
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	/**
	 * Sign data with RSA-SHA256 using the service account private key
	 */
	private async signWithRSA(data: string, privateKeyPem: string): Promise<string> {
		// Import the private key
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

		// Sign the data
		const encoder = new TextEncoder();
		const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(data));

		// Base64URL encode the signature
		const signatureArray = new Uint8Array(signature);
		const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
		return signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	/**
	 * Get an access token, using cache if valid
	 */
	private async getAccessToken(): Promise<string> {
		// Check cache
		if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
			return tokenCache.accessToken;
		}

		// Generate new token
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

		// Cache the token
		tokenCache = {
			accessToken: data.access_token,
			expiresAt: Date.now() + data.expires_in * 1000,
		};

		return data.access_token;
	}

	/**
	 * Get the Vertex AI endpoint URL for a model
	 */
	private getEndpointUrl(model: string, streaming: boolean = false): string {
		// Map common model names to Vertex AI model IDs
		const modelMapping: Record<string, string> = {
			'claude-3-opus': 'claude-3-opus@20240229',
			'claude-3-sonnet': 'claude-3-sonnet@20240229',
			'claude-3-haiku': 'claude-3-haiku@20240307',
			'claude-3-5-sonnet': 'claude-3-5-sonnet@20240620',
			'claude-3-5-sonnet-20240620': 'claude-3-5-sonnet@20240620',
			'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-v2@20241022',
			'claude-3-5-sonnet-v2': 'claude-3-5-sonnet-v2@20241022',
			'claude-3-5-haiku': 'claude-3-5-haiku@20241022',
			'claude-sonnet-4-20250514': 'claude-sonnet-4@20250514',
			'claude-opus-4-20250514': 'claude-opus-4@20250514',
		};

		const vertexModel = modelMapping[model] || model;
		const method = streaming ? 'streamRawPredict' : 'rawPredict';

		return `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/anthropic/models/${vertexModel}:${method}`;
	}

	/**
	 * Create a non-streaming completion
	 */
	async createCompletion(body: RequestBody): Promise<Response> {
		const accessToken = await this.getAccessToken();
		const url = this.getEndpointUrl(body.model, false);

		// Convert to Anthropic Messages API format
		const anthropicBody = this.convertToAnthropicFormat(body);

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(anthropicBody),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('Vertex AI error:', error);
			throw new Error(`Vertex AI request failed: ${response.status} ${error}`);
		}

		const result = await response.json();

		// Convert Anthropic response to OpenAI format for compatibility
		return new Response(JSON.stringify(this.formatResponse(result as any)), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	/**
	 * Create a streaming completion
	 */
	async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
		const accessToken = await this.getAccessToken();
		const url = this.getEndpointUrl(body.model, true);

		// Convert to Anthropic Messages API format
		const anthropicBody = this.convertToAnthropicFormat(body);
		anthropicBody.stream = true;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(anthropicBody),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('Vertex AI streaming error:', error);
			throw new Error(`Vertex AI streaming request failed: ${response.status} ${error}`);
		}

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		return new ReadableStream({
			async pull(controller) {
				const { done, value } = await reader.read();
				if (done) {
					controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
					controller.close();
					return;
				}

				const chunk = decoder.decode(value, { stream: true });
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						try {
							const data = JSON.parse(line.slice(6));
							if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
								controller.enqueue(
									new TextEncoder().encode(
										`data: ${JSON.stringify({
											choices: [{ delta: { content: data.delta.text } }],
										})}\n\n`
									)
								);
							}
						} catch (e) {
							// Skip invalid JSON
						}
					}
				}
			},
		});
	}

	/**
	 * Convert OpenAI-style request to Anthropic Messages API format
	 */
	private convertToAnthropicFormat(body: RequestBody): any {
		const systemMessage = body.messages.find((m) => m.role === 'system');
		const otherMessages = body.messages.filter((m) => m.role !== 'system');

		return {
			anthropic_version: 'vertex-2023-10-16',
			max_tokens: 4096,
			messages: otherMessages.map((m) => ({
				role: m.role === 'assistant' ? 'assistant' : 'user',
				content: typeof m.content === 'string' ? m.content : m.content,
			})),
			...(systemMessage && { system: typeof systemMessage.content === 'string' ? systemMessage.content : '' }),
			...(body.temperature !== undefined && { temperature: body.temperature }),
			...(body.tools && { tools: this.formatTools(body.tools) }),
		};
	}

	/**
	 * Format tools for Anthropic API
	 */
	private formatTools(tools: any[]): any[] {
		return tools.map((tool) => ({
			name: tool.function?.name || tool.name,
			description: tool.function?.description || tool.description,
			input_schema: tool.function?.parameters || tool.input_schema,
		}));
	}

	/**
	 * Format messages (required by AIProvider interface)
	 */
	formatMessages(messages: any[]): any[] {
		return messages.map((m) => ({
			role: m.role === 'assistant' ? 'assistant' : 'user',
			content: typeof m.content === 'string' ? m.content : m.content,
		}));
	}

	/**
	 * Format Anthropic response to OpenAI format
	 */
	formatResponse(response: any): any {
		const textContent = response.content?.find((block: any) => block.type === 'text')?.text || '';

		return {
			choices: [
				{
					message: {
						content: textContent,
						role: 'assistant',
						tool_calls: response.content
							?.filter((block: any) => block.type === 'tool_use')
							.map((block: any) => ({
								type: 'tool_use',
								function: {
									name: block.name,
									arguments: JSON.stringify(block.input),
								},
							})),
					},
				},
			],
		};
	}

	/**
	 * List available models
	 */
	async listModels(): Promise<{ id: string; name: string; provider: string }[]> {
		return [
			// Claude 4.5 (latest)
			{ id: 'claude-opus-4-20250514', name: 'Claude Opus 4.5', provider: 'vertex' },
			{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'vertex' },
			// Gemini 3.0 (latest)
			{ id: 'gemini-3.0-pro', name: 'Gemini 3.0 Pro', provider: 'vertex' },
			{ id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash', provider: 'vertex' },
			// Gemini 2.0
			{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'vertex' },
			{ id: 'gemini-2.0-flash-thinking-exp', name: 'Gemini 2.0 Flash Thinking', provider: 'vertex' },
		];
	}
}

/**
 * Create a passthrough proxy for raw Anthropic API requests to Vertex AI
 * This is what the Agent SDK needs - it sends Anthropic-format requests
 * and expects Anthropic-format responses
 */
export async function proxyToVertex(
	request: Request,
	serviceAccountJson: string,
	projectId: string,
	region: string = 'us-east5'
): Promise<Response> {
	const provider = new VertexAIProvider(serviceAccountJson, projectId, region);

	// Parse the request path to get the model
	const url = new URL(request.url);
	const pathMatch = url.pathname.match(/\/v1\/messages/);

	if (!pathMatch) {
		return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const body = (await request.json()) as {
			model?: string;
			stream?: boolean;
			max_tokens?: number;
			messages?: any[];
			system?: string;
			temperature?: number;
			[key: string]: any;
		};
		const isStreaming = body.stream === true;

		// Get access token
		const accessToken = await (provider as any).getAccessToken();

		// Map model to Vertex format
		const model = body.model || 'claude-sonnet-4@20250514';
		const vertexModel = mapModelToVertex(model);
		const method = isStreaming ? 'streamRawPredict' : 'rawPredict';
		const vertexUrl = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/anthropic/models/${vertexModel}:${method}`;

		// Prepare the body for Vertex AI
		const vertexBody = {
			...body,
			anthropic_version: 'vertex-2023-10-16',
		};
		delete vertexBody.model; // Vertex doesn't use model in body

		console.log('Proxying to Vertex AI:', vertexUrl);

		const response = await fetch(vertexUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(vertexBody),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('Vertex AI error:', error);
			return new Response(JSON.stringify({ error: `Vertex AI error: ${error}` }), {
				status: response.status,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// For streaming, return the response as-is
		if (isStreaming) {
			return new Response(response.body, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive',
				},
			});
		}

		// For non-streaming, return JSON
		const result = await response.json();
		return new Response(JSON.stringify(result), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error: any) {
		console.error('Proxy error:', error);
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

function mapModelToVertex(model: string): string {
	const mapping: Record<string, string> = {
		'claude-3-opus-20240229': 'claude-3-opus@20240229',
		'claude-3-sonnet-20240229': 'claude-3-sonnet@20240229',
		'claude-3-haiku-20240307': 'claude-3-haiku@20240307',
		'claude-3-5-sonnet-20240620': 'claude-3-5-sonnet@20240620',
		'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-v2@20241022',
		'claude-3-5-haiku-20241022': 'claude-3-5-haiku@20241022',
		'claude-sonnet-4-20250514': 'claude-sonnet-4@20250514',
		'claude-opus-4-20250514': 'claude-opus-4@20250514',
		'claude-opus-4-5-20251101': 'claude-opus-4-5@20251101',
		// Short names
		'claude-3-opus': 'claude-3-opus@20240229',
		'claude-3-sonnet': 'claude-3-sonnet@20240229',
		'claude-3-haiku': 'claude-3-haiku@20240307',
		'claude-3-5-sonnet': 'claude-3-5-sonnet-v2@20241022',
		'claude-3-5-haiku': 'claude-3-5-haiku@20241022',
	};

	return mapping[model] || model;
}
