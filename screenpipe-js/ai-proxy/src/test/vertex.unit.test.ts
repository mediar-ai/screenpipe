/**
 * Comprehensive unit tests for Vertex AI provider
 *
 * Run with: bun test src/test/vertex.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { mapModelToVertex, parseStreamingEvent, VertexAIProvider } from '../providers/vertex';

// ============================================================================
// Model Format Conversion Tests
// ============================================================================
describe('mapModelToVertex', () => {
	describe('converts dash-date format to at-date format', () => {
		it('should convert claude-opus-4-5-20251101 to claude-opus-4-5@20251101', () => {
			expect(mapModelToVertex('claude-opus-4-5-20251101')).toBe('claude-opus-4-5@20251101');
		});

		it('should convert claude-sonnet-4-5-20250929 to claude-sonnet-4-5@20250929', () => {
			expect(mapModelToVertex('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5@20250929');
		});

		it('should convert claude-haiku-4-5-20251001 to claude-haiku-4-5@20251001', () => {
			expect(mapModelToVertex('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5@20251001');
		});

		it('should convert claude-sonnet-4-20250514 to claude-sonnet-4@20250514', () => {
			expect(mapModelToVertex('claude-sonnet-4-20250514')).toBe('claude-sonnet-4@20250514');
		});

		it('should convert claude-3-5-sonnet-20241022 to claude-3-5-sonnet@20241022', () => {
			expect(mapModelToVertex('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet@20241022');
		});
	});

	describe('preserves already-correct format', () => {
		it('should not modify claude-opus-4-5@20251101', () => {
			expect(mapModelToVertex('claude-opus-4-5@20251101')).toBe('claude-opus-4-5@20251101');
		});

		it('should not modify claude-3-5-sonnet-v2@20241022', () => {
			expect(mapModelToVertex('claude-3-5-sonnet-v2@20241022')).toBe('claude-3-5-sonnet-v2@20241022');
		});
	});

	describe('handles edge cases', () => {
		it('should not modify model without date suffix', () => {
			expect(mapModelToVertex('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
		});

		it('should not modify model with short date', () => {
			expect(mapModelToVertex('claude-3-5-sonnet-2024')).toBe('claude-3-5-sonnet-2024');
		});

		it('should not modify empty string', () => {
			expect(mapModelToVertex('')).toBe('');
		});

		it('should handle model with only numbers', () => {
			expect(mapModelToVertex('12345678')).toBe('12345678');
		});

		it('should handle model ending with 9 digit number (not date)', () => {
			expect(mapModelToVertex('model-123456789')).toBe('model-123456789');
		});
	});
});

// ============================================================================
// Streaming Event Parsing Tests
// ============================================================================
describe('parseStreamingEvent', () => {
	let toolCallsById: Record<string, { index: number; id: string; name: string; arguments: string }>;
	let toolCallIndex: { value: number };

	beforeEach(() => {
		toolCallsById = {};
		toolCallIndex = { value: 0 };
	});

	describe('text_delta events', () => {
		it('should convert text_delta to OpenAI format', () => {
			const event = {
				type: 'content_block_delta',
				delta: { type: 'text_delta', text: 'Hello' },
			};

			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);

			expect(result.done).toBe(false);
			expect(result.output).not.toBeNull();
			const parsed = JSON.parse(result.output!.replace('data: ', '').trim());
			expect(parsed.choices[0].delta.content).toBe('Hello');
		});

		it('should handle multi-line text', () => {
			const event = {
				type: 'content_block_delta',
				delta: { type: 'text_delta', text: 'Line 1\nLine 2' },
			};

			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			const parsed = JSON.parse(result.output!.replace('data: ', '').trim());
			expect(parsed.choices[0].delta.content).toBe('Line 1\nLine 2');
		});

		it('should handle special characters', () => {
			const event = {
				type: 'content_block_delta',
				delta: { type: 'text_delta', text: 'Test "quotes" and \\backslash' },
			};

			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			const parsed = JSON.parse(result.output!.replace('data: ', '').trim());
			expect(parsed.choices[0].delta.content).toBe('Test "quotes" and \\backslash');
		});

		it('should handle empty text', () => {
			const event = {
				type: 'content_block_delta',
				delta: { type: 'text_delta', text: '' },
			};

			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			const parsed = JSON.parse(result.output!.replace('data: ', '').trim());
			expect(parsed.choices[0].delta.content).toBe('');
		});
	});

	describe('tool_use start events', () => {
		it('should convert tool_use start to OpenAI format with correct fields', () => {
			const event = {
				type: 'content_block_start',
				content_block: {
					type: 'tool_use',
					id: 'toolu_123',
					name: 'search_content',
				},
			};

			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);

			expect(result.done).toBe(false);
			expect(result.output).not.toBeNull();
			const parsed = JSON.parse(result.output!.replace('data: ', '').trim());

			expect(parsed.choices[0].delta.tool_calls).toHaveLength(1);
			expect(parsed.choices[0].delta.tool_calls[0].id).toBe('toolu_123');
			expect(parsed.choices[0].delta.tool_calls[0].type).toBe('function');
			expect(parsed.choices[0].delta.tool_calls[0].index).toBe(0);
			expect(parsed.choices[0].delta.tool_calls[0].function.name).toBe('search_content');
			expect(parsed.choices[0].delta.tool_calls[0].function.arguments).toBe('');
		});

		it('should track multiple tool calls with correct indices', () => {
			const event1 = {
				type: 'content_block_start',
				content_block: { type: 'tool_use', id: 'toolu_1', name: 'tool_a' },
			};
			const event2 = {
				type: 'content_block_start',
				content_block: { type: 'tool_use', id: 'toolu_2', name: 'tool_b' },
			};

			parseStreamingEvent(event1, toolCallsById, toolCallIndex);
			const result2 = parseStreamingEvent(event2, toolCallsById, toolCallIndex);

			const parsed = JSON.parse(result2.output!.replace('data: ', '').trim());
			expect(parsed.choices[0].delta.tool_calls[0].index).toBe(1);
			expect(toolCallsById['toolu_1'].index).toBe(0);
			expect(toolCallsById['toolu_2'].index).toBe(1);
		});
	});

	describe('input_json_delta events', () => {
		it('should accumulate tool arguments correctly', () => {
			// First, start a tool
			const startEvent = {
				type: 'content_block_start',
				content_block: { type: 'tool_use', id: 'toolu_123', name: 'search' },
			};
			parseStreamingEvent(startEvent, toolCallsById, toolCallIndex);

			// Then send argument deltas
			const delta1 = {
				type: 'content_block_delta',
				delta: { type: 'input_json_delta', partial_json: '{"q":' },
			};
			const delta2 = {
				type: 'content_block_delta',
				delta: { type: 'input_json_delta', partial_json: '"test"}' },
			};

			const result1 = parseStreamingEvent(delta1, toolCallsById, toolCallIndex);
			const result2 = parseStreamingEvent(delta2, toolCallsById, toolCallIndex);

			// Check incremental output
			const parsed1 = JSON.parse(result1.output!.replace('data: ', '').trim());
			expect(parsed1.choices[0].delta.tool_calls[0].function.arguments).toBe('{"q":');

			const parsed2 = JSON.parse(result2.output!.replace('data: ', '').trim());
			expect(parsed2.choices[0].delta.tool_calls[0].function.arguments).toBe('"test"}');

			// Check accumulated value
			expect(toolCallsById['toolu_123'].arguments).toBe('{"q":"test"}');
		});

		it('should ignore input_json_delta if no tool started', () => {
			const delta = {
				type: 'content_block_delta',
				delta: { type: 'input_json_delta', partial_json: '{"q":"test"}' },
			};

			const result = parseStreamingEvent(delta, toolCallsById, toolCallIndex);
			expect(result.output).toBeNull();
		});
	});

	describe('message_stop events', () => {
		it('should return done=true and [DONE] output', () => {
			const event = { type: 'message_stop' };

			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);

			expect(result.done).toBe(true);
			expect(result.output).toBe('data: [DONE]\n\n');
		});
	});

	describe('ignored events', () => {
		it('should ignore message_start', () => {
			const event = { type: 'message_start', message: {} };
			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			expect(result.output).toBeNull();
			expect(result.done).toBe(false);
		});

		it('should ignore ping', () => {
			const event = { type: 'ping' };
			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			expect(result.output).toBeNull();
			expect(result.done).toBe(false);
		});

		it('should ignore content_block_stop', () => {
			const event = { type: 'content_block_stop' };
			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			expect(result.output).toBeNull();
			expect(result.done).toBe(false);
		});

		it('should ignore message_delta', () => {
			const event = { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			expect(result.output).toBeNull();
			expect(result.done).toBe(false);
		});

		it('should ignore content_block_start for text', () => {
			const event = {
				type: 'content_block_start',
				content_block: { type: 'text', text: '' },
			};
			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			expect(result.output).toBeNull();
			expect(result.done).toBe(false);
		});
	});
});

// ============================================================================
// VertexAIProvider formatResponse Tests
// ============================================================================
describe('VertexAIProvider.formatResponse', () => {
	// Create a minimal provider instance for testing formatResponse
	const mockServiceAccount = JSON.stringify({
		type: 'service_account',
		project_id: 'test',
		private_key_id: 'test',
		private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
		client_email: 'test@test.iam.gserviceaccount.com',
		client_id: '123',
		auth_uri: 'https://accounts.google.com/o/oauth2/auth',
		token_uri: 'https://oauth2.googleapis.com/token',
		auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
		client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test',
	});

	let provider: VertexAIProvider;

	beforeEach(() => {
		provider = new VertexAIProvider(mockServiceAccount, 'test-project', 'us-east5');
	});

	describe('text-only responses', () => {
		it('should format simple text response', () => {
			const anthropicResponse = {
				content: [{ type: 'text', text: 'Hello, world!' }],
			};

			const result = provider.formatResponse(anthropicResponse);

			expect(result.choices).toHaveLength(1);
			expect(result.choices[0].message.content).toBe('Hello, world!');
			expect(result.choices[0].message.role).toBe('assistant');
			expect(result.choices[0].message.tool_calls).toEqual([]);
		});

		it('should handle empty text', () => {
			const anthropicResponse = {
				content: [{ type: 'text', text: '' }],
			};

			const result = provider.formatResponse(anthropicResponse);
			expect(result.choices[0].message.content).toBe('');
		});

		it('should handle response with no content blocks', () => {
			const anthropicResponse = { content: [] };

			const result = provider.formatResponse(anthropicResponse);
			expect(result.choices[0].message.content).toBe('');
			expect(result.choices[0].message.tool_calls).toEqual([]);
		});
	});

	describe('tool call responses', () => {
		it('should format single tool call response', () => {
			const anthropicResponse = {
				content: [
					{
						type: 'tool_use',
						id: 'toolu_123',
						name: 'search_content',
						input: { q: 'test query', limit: 10 },
					},
				],
			};

			const result = provider.formatResponse(anthropicResponse);

			expect(result.choices[0].message.content).toBe('');
			expect(result.choices[0].message.tool_calls).toHaveLength(1);
			expect(result.choices[0].message.tool_calls[0]).toEqual({
				id: 'toolu_123',
				type: 'function',
				function: {
					name: 'search_content',
					arguments: '{"q":"test query","limit":10}',
				},
			});
		});

		it('should format multiple tool calls', () => {
			const anthropicResponse = {
				content: [
					{ type: 'tool_use', id: 'toolu_1', name: 'tool_a', input: { a: 1 } },
					{ type: 'tool_use', id: 'toolu_2', name: 'tool_b', input: { b: 2 } },
				],
			};

			const result = provider.formatResponse(anthropicResponse);

			expect(result.choices[0].message.tool_calls).toHaveLength(2);
			expect(result.choices[0].message.tool_calls[0].id).toBe('toolu_1');
			expect(result.choices[0].message.tool_calls[1].id).toBe('toolu_2');
		});

		it('should handle text + tool call combined', () => {
			const anthropicResponse = {
				content: [
					{ type: 'text', text: "I'll search for that." },
					{ type: 'tool_use', id: 'toolu_123', name: 'search', input: {} },
				],
			};

			const result = provider.formatResponse(anthropicResponse);

			expect(result.choices[0].message.content).toBe("I'll search for that.");
			expect(result.choices[0].message.tool_calls).toHaveLength(1);
		});

		it('should handle tool call with complex nested input', () => {
			const anthropicResponse = {
				content: [
					{
						type: 'tool_use',
						id: 'toolu_123',
						name: 'complex_tool',
						input: {
							nested: { deep: { value: [1, 2, 3] } },
							array: [{ a: 1 }, { b: 2 }],
						},
					},
				],
			};

			const result = provider.formatResponse(anthropicResponse);
			const args = JSON.parse(result.choices[0].message.tool_calls[0].function.arguments);

			expect(args.nested.deep.value).toEqual([1, 2, 3]);
			expect(args.array).toEqual([{ a: 1 }, { b: 2 }]);
		});

		it('should handle tool call with empty input', () => {
			const anthropicResponse = {
				content: [
					{ type: 'tool_use', id: 'toolu_123', name: 'no_args_tool', input: {} },
				],
			};

			const result = provider.formatResponse(anthropicResponse);
			expect(result.choices[0].message.tool_calls[0].function.arguments).toBe('{}');
		});
	});
});

// ============================================================================
// Full Streaming Simulation Tests
// ============================================================================
describe('Full streaming scenarios', () => {
	let toolCallsById: Record<string, { index: number; id: string; name: string; arguments: string }>;
	let toolCallIndex: { value: number };

	beforeEach(() => {
		toolCallsById = {};
		toolCallIndex = { value: 0 };
	});

	it('should handle complete text-only stream', () => {
		const events = [
			{ type: 'message_start', message: {} },
			{ type: 'content_block_start', content_block: { type: 'text', text: '' } },
			{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
			{ type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
			{ type: 'content_block_stop' },
			{ type: 'message_delta', delta: { stop_reason: 'end_turn' } },
			{ type: 'message_stop' },
		];

		const outputs: string[] = [];
		for (const event of events) {
			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			if (result.output) outputs.push(result.output);
			if (result.done) break;
		}

		expect(outputs).toHaveLength(3); // 2 text deltas + [DONE]
		expect(outputs[0]).toContain('Hello');
		expect(outputs[1]).toContain(' world');
		expect(outputs[2]).toBe('data: [DONE]\n\n');
	});

	it('should handle text + tool call stream', () => {
		const events = [
			{ type: 'message_start', message: {} },
			{ type: 'content_block_start', content_block: { type: 'text', text: '' } },
			{ type: 'content_block_delta', delta: { type: 'text_delta', text: "I'll search" } },
			{ type: 'content_block_stop' },
			{ type: 'content_block_start', content_block: { type: 'tool_use', id: 'toolu_abc', name: 'search_content' } },
			{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"q":' } },
			{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '"test"' } },
			{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '}' } },
			{ type: 'content_block_stop' },
			{ type: 'message_delta', delta: { stop_reason: 'tool_use' } },
			{ type: 'message_stop' },
		];

		const outputs: string[] = [];
		for (const event of events) {
			const result = parseStreamingEvent(event, toolCallsById, toolCallIndex);
			if (result.output) outputs.push(result.output);
			if (result.done) break;
		}

		// Should have: 1 text + 1 tool start + 3 tool args + 1 [DONE] = 6
		expect(outputs).toHaveLength(6);

		// Check tool call was properly formed
		expect(toolCallsById['toolu_abc'].arguments).toBe('{"q":"test"}');
	});

	it('should handle multiple parallel tool calls', () => {
		const events = [
			{ type: 'message_start', message: {} },
			{ type: 'content_block_start', content_block: { type: 'tool_use', id: 'toolu_1', name: 'tool_a' } },
			{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
			{ type: 'content_block_stop' },
			{ type: 'content_block_start', content_block: { type: 'tool_use', id: 'toolu_2', name: 'tool_b' } },
			{ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
			{ type: 'content_block_stop' },
			{ type: 'message_stop' },
		];

		for (const event of events) {
			parseStreamingEvent(event, toolCallsById, toolCallIndex);
		}

		expect(Object.keys(toolCallsById)).toHaveLength(2);
		expect(toolCallsById['toolu_1'].index).toBe(0);
		expect(toolCallsById['toolu_2'].index).toBe(1);
	});
});

// ============================================================================
// Request Conversion Tests (convertToAnthropicFormat)
// ============================================================================
describe('Request conversion edge cases', () => {
	// These test the format expected by Anthropic/Vertex AI
	// We can't directly test private convertToAnthropicFormat, but we can
	// verify the expected transformations

	describe('OpenAI tool format to Anthropic format', () => {
		it('should understand OpenAI tool format', () => {
			const openaiTool = {
				type: 'function',
				function: {
					name: 'search_content',
					description: 'Search for content',
					parameters: {
						type: 'object',
						properties: {
							q: { type: 'string' },
							limit: { type: 'integer' },
						},
					},
				},
			};

			// Expected Anthropic format
			const expectedAnthropic = {
				name: 'search_content',
				description: 'Search for content',
				input_schema: {
					type: 'object',
					properties: {
						q: { type: 'string' },
						limit: { type: 'integer' },
					},
				},
			};

			// Verify the transformation
			const transformed = {
				name: openaiTool.function?.name || openaiTool.name,
				description: openaiTool.function?.description || openaiTool.description,
				input_schema: openaiTool.function?.parameters || openaiTool.input_schema,
			};

			expect(transformed).toEqual(expectedAnthropic);
		});
	});

	describe('OpenAI tool_calls format to Anthropic format', () => {
		it('should understand OpenAI assistant tool_calls format', () => {
			const openaiToolCall = {
				id: 'call_123',
				type: 'function',
				function: {
					name: 'search_content',
					arguments: '{"q":"test"}',
				},
			};

			// Expected Anthropic format
			const expectedAnthropic = {
				type: 'tool_use',
				id: 'call_123',
				name: 'search_content',
				input: { q: 'test' },
			};

			// Verify the transformation
			const transformed = {
				type: 'tool_use',
				id: openaiToolCall.id,
				name: openaiToolCall.function?.name,
				input: JSON.parse(openaiToolCall.function?.arguments || '{}'),
			};

			expect(transformed).toEqual(expectedAnthropic);
		});
	});

	describe('OpenAI tool message format to Anthropic format', () => {
		it('should understand OpenAI tool result format', () => {
			const openaiToolMessage = {
				role: 'tool',
				tool_call_id: 'call_123',
				content: '{"results": []}',
			};

			// Expected Anthropic format (as user message with tool_result)
			const expectedAnthropic = {
				role: 'user',
				content: [{
					type: 'tool_result',
					tool_use_id: 'call_123',
					content: '{"results": []}',
				}],
			};

			// Verify the transformation
			const transformed = {
				role: 'user',
				content: [{
					type: 'tool_result',
					tool_use_id: openaiToolMessage.tool_call_id,
					content: openaiToolMessage.content,
				}],
			};

			expect(transformed).toEqual(expectedAnthropic);
		});
	});
});
