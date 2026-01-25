import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { VertexAIProvider, resetTokenCache } from './vertex';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.subtle for JWT signing
const mockSign = vi.fn().mockResolvedValue(new ArrayBuffer(256));
const mockImportKey = vi.fn().mockResolvedValue({});
global.crypto = {
	subtle: {
		importKey: mockImportKey,
		sign: mockSign,
	},
} as any;

const TEST_SERVICE_ACCOUNT = JSON.stringify({
	type: 'service_account',
	project_id: 'test-project',
	private_key_id: 'key-id',
	private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHBYMi0oBFCKXeKmjZqXqMM8k0aMELGjGfDkfJz+Ej1r4P4HQMK+W9BCwPT8+1y1zvUzLuXJvnNsvTuJlzrJeYeoCVGVFECg4wTzKFVDNVGg4E+ArSq7R+gJRPpoXqZMDpJfLMfnFPPfQZlHJBIYQ/o0At9a8fNHkAAzMBYCnQfl6F3MFa1vMHEPbLwMDYYEOONnZJ1lMREa9UH8CDQHU/Y3MDfoQ1pVdLjWp4FPnNNg3f9kI5thVwWyVae8j0ZfyeFDLWVGKpJJJLMIduYmnqGkwatwOjj0dVNrMfQtA4FpLH+E+CmMJUt1DQIDAQAB\n-----END PRIVATE KEY-----\n',
	client_email: 'test@test-project.iam.gserviceaccount.com',
	client_id: '123456789',
	auth_uri: 'https://accounts.google.com/o/oauth2/auth',
	token_uri: 'https://oauth2.googleapis.com/token',
	auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
	client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test',
});

const TEST_PROJECT_ID = 'test-project';
const TEST_REGION = 'us-east5';

describe('VertexAIProvider', () => {
	let provider: VertexAIProvider;

	beforeEach(() => {
		vi.clearAllMocks();
		resetTokenCache(); // Clear token cache between tests
		provider = new VertexAIProvider(TEST_SERVICE_ACCOUNT, TEST_PROJECT_ID, TEST_REGION);

		// Mock token fetch
		mockFetch.mockImplementation((url: string) => {
			if (url === 'https://oauth2.googleapis.com/token') {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
				});
			}
			return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
		});
	});

	describe('Model Mapping', () => {
		it('should map claude-opus-4-5 to correct Vertex format', async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('claude-opus-4-5@20251101')) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hello' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve(`Unexpected URL: ${url}`) });
			});

			const response = await provider.createCompletion({
				model: 'claude-opus-4-5',
				messages: [{ role: 'user', content: 'Hi' }],
			});

			expect(response.ok).toBe(true);
			const calls = mockFetch.mock.calls;
			const vertexCall = calls.find((c: any[]) => c[0].includes('aiplatform.googleapis.com'));
			expect(vertexCall?.[0]).toContain('claude-opus-4-5@20251101');
		});

		it('should map claude-sonnet-4-5 to correct Vertex format', async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('claude-sonnet-4-5@20250929')) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hello' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve(`Unexpected URL: ${url}`) });
			});

			const response = await provider.createCompletion({
				model: 'claude-sonnet-4-5',
				messages: [{ role: 'user', content: 'Hi' }],
			});

			expect(response.ok).toBe(true);
		});

		it('should map claude-sonnet-4 to correct Vertex format', async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('claude-sonnet-4@20250514')) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hello' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve(`Unexpected URL: ${url}`) });
			});

			const response = await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [{ role: 'user', content: 'Hi' }],
			});

			expect(response.ok).toBe(true);
		});
	});

	describe('Message Conversion', () => {
		it('should convert simple user message', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hello' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [{ role: 'user', content: 'Hello' }],
			});

			expect(capturedBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
		});

		it('should convert system message to system field', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hello' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [
					{ role: 'system', content: 'You are helpful' },
					{ role: 'user', content: 'Hello' },
				],
			});

			expect(capturedBody.system).toBe('You are helpful');
			expect(capturedBody.messages).toEqual([{ role: 'user', content: 'Hello' }]);
		});

		it('should convert assistant message with tool_calls to Anthropic format', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Done' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [
					{ role: 'user', content: 'Search for cats' },
					{
						role: 'assistant',
						content: null,
						tool_calls: [
							{
								id: 'call_123',
								function: {
									name: 'search',
									arguments: '{"query":"cats"}',
								},
							},
						],
					},
					{
						role: 'tool',
						tool_call_id: 'call_123',
						content: 'Found 10 cats',
					},
					{ role: 'user', content: 'Thanks!' },
				],
			});

			// Check assistant message was converted with tool_use
			const assistantMsg = capturedBody.messages.find((m: any) => m.role === 'assistant');
			expect(assistantMsg).toBeDefined();
			expect(Array.isArray(assistantMsg.content)).toBe(true);
			expect(assistantMsg.content.some((c: any) => c.type === 'tool_use')).toBe(true);

			// Check tool result was converted
			const toolResultMsg = capturedBody.messages.find(
				(m: any) => m.role === 'user' && Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_result')
			);
			expect(toolResultMsg).toBeDefined();
		});

		it('should handle assistant message with both text and tool_calls', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Done' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [
					{ role: 'user', content: 'Search for cats' },
					{
						role: 'assistant',
						content: 'Let me search for that.',
						tool_calls: [
							{
								id: 'call_123',
								function: {
									name: 'search',
									arguments: '{"query":"cats"}',
								},
							},
						],
					},
				],
			});

			const assistantMsg = capturedBody.messages.find((m: any) => m.role === 'assistant');
			expect(Array.isArray(assistantMsg.content)).toBe(true);
			expect(assistantMsg.content.find((c: any) => c.type === 'text')?.text).toBe('Let me search for that.');
			expect(assistantMsg.content.find((c: any) => c.type === 'tool_use')).toBeDefined();
		});

		it('should handle multiple tool calls in single message', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Done' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [
					{ role: 'user', content: 'Search for cats and dogs' },
					{
						role: 'assistant',
						content: null,
						tool_calls: [
							{ id: 'call_1', function: { name: 'search', arguments: '{"query":"cats"}' } },
							{ id: 'call_2', function: { name: 'search', arguments: '{"query":"dogs"}' } },
						],
					},
					{ role: 'tool', tool_call_id: 'call_1', content: 'Found cats' },
					{ role: 'tool', tool_call_id: 'call_2', content: 'Found dogs' },
				],
			});

			const assistantMsg = capturedBody.messages.find((m: any) => m.role === 'assistant');
			const toolUses = assistantMsg.content.filter((c: any) => c.type === 'tool_use');
			expect(toolUses.length).toBe(2);

			const toolResults = capturedBody.messages.filter(
				(m: any) => m.role === 'user' && Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool_result')
			);
			expect(toolResults.length).toBe(2);
		});
	});

	describe('Multi-turn Conversations', () => {
		it('should handle basic multi-turn conversation', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Response' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [
					{ role: 'user', content: 'Hi' },
					{ role: 'assistant', content: 'Hello!' },
					{ role: 'user', content: 'How are you?' },
					{ role: 'assistant', content: 'I am good!' },
					{ role: 'user', content: 'Great' },
				],
			});

			expect(capturedBody.messages.length).toBe(5);
			expect(capturedBody.messages[0].role).toBe('user');
			expect(capturedBody.messages[1].role).toBe('assistant');
			expect(capturedBody.messages[2].role).toBe('user');
		});

		it('should handle multi-turn with tool calls', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Final response' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [
					{ role: 'system', content: 'You are a helpful assistant' },
					{ role: 'user', content: 'What is the weather?' },
					{
						role: 'assistant',
						content: null,
						tool_calls: [{ id: 'call_weather', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } }],
					},
					{ role: 'tool', tool_call_id: 'call_weather', content: 'Sunny, 72F' },
					{ role: 'assistant', content: 'The weather in NYC is sunny and 72F.' },
					{ role: 'user', content: 'What about tomorrow?' },
					{
						role: 'assistant',
						content: null,
						tool_calls: [{ id: 'call_weather2', function: { name: 'get_weather', arguments: '{"city":"NYC","day":"tomorrow"}' } }],
					},
					{ role: 'tool', tool_call_id: 'call_weather2', content: 'Cloudy, 65F' },
				],
			});

			expect(capturedBody.system).toBe('You are a helpful assistant');
			// Count the messages (excluding system)
			const userMsgs = capturedBody.messages.filter((m: any) => m.role === 'user');
			const assistantMsgs = capturedBody.messages.filter((m: any) => m.role === 'assistant');
			expect(userMsgs.length).toBeGreaterThan(0);
			expect(assistantMsgs.length).toBeGreaterThan(0);
		});
	});

	describe('Tool Formatting', () => {
		it('should format OpenAI-style tools to Anthropic format', async () => {
			let capturedBody: any;
			mockFetch.mockImplementation((url: string, options?: any) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					capturedBody = JSON.parse(options?.body);
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hello' }] }),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [{ role: 'user', content: 'Search for cats' }],
				tools: [
					{
						type: 'function',
						function: {
							name: 'search',
							description: 'Search for items',
							parameters: {
								type: 'object',
								properties: {
									query: { type: 'string', description: 'Search query' },
								},
								required: ['query'],
							},
						},
					},
				],
			});

			expect(capturedBody.tools).toBeDefined();
			expect(capturedBody.tools[0].name).toBe('search');
			expect(capturedBody.tools[0].description).toBe('Search for items');
			expect(capturedBody.tools[0].input_schema).toBeDefined();
		});
	});

	describe('Response Formatting', () => {
		it('should format text response to OpenAI format', async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve({
								content: [{ type: 'text', text: 'Hello there!' }],
							}),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			const response = await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [{ role: 'user', content: 'Hi' }],
			});

			const body = await response.json();
			expect(body.choices).toBeDefined();
			expect(body.choices[0].message.content).toBe('Hello there!');
			expect(body.choices[0].message.role).toBe('assistant');
		});

		it('should format tool_use response to OpenAI format', async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve({
								content: [
									{ type: 'text', text: 'Let me search for that.' },
									{ type: 'tool_use', id: 'call_123', name: 'search', input: { query: 'cats' } },
								],
							}),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			const response = await provider.createCompletion({
				model: 'claude-sonnet-4',
				messages: [{ role: 'user', content: 'Search for cats' }],
			});

			const body = await response.json();
			expect(body.choices[0].message.content).toBe('Let me search for that.');
			expect(body.choices[0].message.tool_calls).toBeDefined();
			expect(body.choices[0].message.tool_calls.length).toBe(1);
			expect(body.choices[0].message.tool_calls[0].function.name).toBe('search');
		});
	});

	describe('Streaming', () => {
		it('should stream text responses in OpenAI format', async () => {
			const streamData = [
				'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
				'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
				'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
				'data: {"type":"message_stop"}\n\n',
			];

			let streamIndex = 0;
			const mockReader = {
				read: vi.fn().mockImplementation(() => {
					if (streamIndex < streamData.length) {
						const chunk = new TextEncoder().encode(streamData[streamIndex++]);
						return Promise.resolve({ done: false, value: chunk });
					}
					return Promise.resolve({ done: true, value: undefined });
				}),
			};

			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com') && url.includes('streamRawPredict')) {
					return Promise.resolve({
						ok: true,
						body: { getReader: () => mockReader },
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			const stream = await provider.createStreamingCompletion({
				model: 'claude-sonnet-4',
				messages: [{ role: 'user', content: 'Hi' }],
				stream: true,
			});

			const reader = stream.getReader();
			const chunks: string[] = [];
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(decoder.decode(value));
			}

			const allData = chunks.join('');
			expect(allData).toContain('data:');
			expect(allData).toContain('Hello');
			expect(allData).toContain('[DONE]');
		});

		it('should stream tool calls in OpenAI format', async () => {
			const streamData = [
				'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_123","name":"search","input":{}}}\n\n',
				'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"que"}}\n\n',
				'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"ry\\":\\"cats\\"}"}}\n\n',
				'data: {"type":"message_stop"}\n\n',
			];

			let streamIndex = 0;
			const mockReader = {
				read: vi.fn().mockImplementation(() => {
					if (streamIndex < streamData.length) {
						const chunk = new TextEncoder().encode(streamData[streamIndex++]);
						return Promise.resolve({ done: false, value: chunk });
					}
					return Promise.resolve({ done: true, value: undefined });
				}),
			};

			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com') && url.includes('streamRawPredict')) {
					return Promise.resolve({
						ok: true,
						body: { getReader: () => mockReader },
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			const stream = await provider.createStreamingCompletion({
				model: 'claude-sonnet-4',
				messages: [{ role: 'user', content: 'Search for cats' }],
				stream: true,
			});

			const reader = stream.getReader();
			const chunks: string[] = [];
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(decoder.decode(value));
			}

			const allData = chunks.join('');
			expect(allData).toContain('tool_calls');
			expect(allData).toContain('search');
			expect(allData).toContain('[DONE]');
		});
	});

	describe('Error Handling', () => {
		it('should throw on Vertex AI error', async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ access_token: 'test-token', expires_in: 3600 }),
					});
				}
				if (url.includes('aiplatform.googleapis.com')) {
					return Promise.resolve({
						ok: false,
						status: 400,
						text: () => Promise.resolve('Bad request: invalid model'),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await expect(
				provider.createCompletion({
					model: 'claude-sonnet-4',
					messages: [{ role: 'user', content: 'Hi' }],
				})
			).rejects.toThrow('Vertex AI request failed');
		});

		it('should throw on token fetch error', async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === 'https://oauth2.googleapis.com/token') {
					return Promise.resolve({
						ok: false,
						text: () => Promise.resolve('Invalid credentials'),
					});
				}
				return Promise.resolve({ ok: false, text: () => Promise.resolve('Not found') });
			});

			await expect(
				provider.createCompletion({
					model: 'claude-sonnet-4',
					messages: [{ role: 'user', content: 'Hi' }],
				})
			).rejects.toThrow('Failed to get access token');
		});
	});

	describe('listModels', () => {
		it('should return available models', async () => {
			const models = await provider.listModels();
			expect(models.length).toBeGreaterThan(0);
			expect(models.some((m) => m.id.includes('claude'))).toBe(true);
			expect(models.every((m) => m.provider === 'vertex')).toBe(true);
		});
	});
});
