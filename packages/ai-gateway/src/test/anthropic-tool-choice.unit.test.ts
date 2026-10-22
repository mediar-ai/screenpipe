// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { describe, expect, it } from 'bun:test';
import { AnthropicProvider } from '../providers/anthropic';
import type { RequestBody } from '../types';

const choices = [
	[undefined, undefined],
	['auto', { type: 'auto' }],
	['required', { type: 'any' }],
	['none', { type: 'none' }],
	[{ type: 'function', function: { name: 'confirm' } }, { type: 'tool', name: 'confirm' }],
] as const;

describe('Anthropic caller tool choice', () => {
	for (const streaming of [false, true]) {
		for (const [choice, expected] of choices) {
			it(`preserves ${JSON.stringify(choice)} on ${streaming ? 'streaming' : 'JSON'} requests`, async () => {
				const provider = new AnthropicProvider('synthetic-test-key');
				let sent: any;
				(provider as any).client.messages.create = async (params: any) => {
					sent = params;
					return streaming ? {
						controller: new AbortController(),
						async *[Symbol.asyncIterator]() { yield { type: 'message_delta', delta: { stop_reason: 'end_turn' } }; },
					} : { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
				};
				const body: RequestBody = {
					model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'Reply OK.' }],
					tools: [{ type: 'function', function: { name: 'confirm', parameters: { type: 'object' } } }],
					tool_choice: choice as RequestBody['tool_choice'],
				};
				if (streaming) await new Response(await provider.createStreamingCompletion(body)).text();
				else await provider.createCompletion(body);
				expect(sent.tool_choice).toEqual(expected);
				expect(sent.tools[0].name).toBe('confirm');
			});
		}
	}
});
