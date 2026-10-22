// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

// Synthetic-only acceptance through the real loopback Worker. The outbound
// bridge is test instrumentation; it does not implement production selection.
import { getHostedAiAllowedModels } from '../src/services/hosted-ai-policy';
import { LocalGatewayHarness } from '../src/test/local-gateway-harness';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.argv.includes('--allow-spend')) throw new Error('Requires --allow-spend for live synthetic inference');
const key = process.env.EXPLABS_API_KEY;
if (!key || !/^xpl_[0-9a-f]{40}$/.test(key)) throw new Error('Missing EXPLABS_API_KEY');
const expectedOrg = process.env.EXPERIENTIAL_ACCEPTANCE_ORG_ID;
if (!expectedOrg) throw new Error('Missing EXPERIENTIAL_ACCEPTANCE_ORG_ID');
const output = process.env.EXPERIENTIAL_ACCEPTANCE_REPORT;
if (!output) throw new Error('Missing EXPERIENTIAL_ACCEPTANCE_REPORT');
const imagePath = resolve(import.meta.dir, '../src/test/fixtures/experiential-digits.png');
const image = 'data:image/png;base64,' + readFileSync(imagePath).toString('base64');
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
const tool = { type: 'function', function: { name: 'confirm', description: 'Return confirmation', parameters: schema, strict: true } };
const attempts: any[] = [];
const results: any[] = [];
// These routes retain their existing protocols/providers during this cutover.
const retainedModels = new Set(['glm-5.3-flash-reap50-iq3m', 'screenpipe-event-classifier', 'gemini-4-argon']);
const selectedModels = process.env.EXPERIENTIAL_ACCEPTANCE_MODELS?.split(',');
const selectedModes = process.env.EXPERIENTIAL_ACCEPTANCE_MODES?.split(',');
const applicableModels = getHostedAiAllowedModels('business').filter((model) => !retainedModels.has(model));
const modes = ['chat', 'stream', 'tools', 'schema', 'image'];
if (selectedModels?.some((model) => !applicableModels.includes(model))) throw new Error('Unknown or retained test model');
if (selectedModes?.some((mode) => !modes.includes(mode))) throw new Error('Unknown test mode');
const orgResponse = await fetch('https://api.experientiallabs.ai/api/whoami', { headers: { Authorization: 'Bearer ' + key } });
const org: any = await orgResponse.json();
if (org.org_id !== expectedOrg) throw new Error('Wrong test organization');
const policy: any = await (
	await fetch('https://api.experientiallabs.ai/api/orgs/' + org.org_id + '/provider-policy', {
		headers: { Authorization: 'Bearer ' + key },
	})
).json();
const capture: any = await (
	await fetch('https://api.experientiallabs.ai/api/orgs/' + org.org_id + '/telemetry-settings', {
		headers: { Authorization: 'Bearer ' + key },
	})
).json();
if (policy.policy?.require_zdr !== false || capture.capture_prompt_content !== true)
	throw new Error('Test requires the authorized retention-enabled organization configuration');
const harness = await LocalGatewayHarness.start({
	captureBodies: false,
	outboundResponse: async (request, body: any) => {
		const source = new URL(request.url);
		if (source.hostname !== 'gateway.ai.cloudflare.com' || request.method !== 'POST') return undefined;
		let path: string;
		if (source.pathname.endsWith('/openai/chat/completions')) path = '/v1/chat/completions';
		else if (source.pathname.endsWith('/openai/responses')) path = '/v1/responses';
		else if (source.pathname.endsWith('/anthropic/v1/messages')) path = '/v1/messages';
		else return undefined;
		if (retainedModels.has(body.model)) throw new Error('A retained provider route entered the Experiential bridge');
		// Catalog proof: claude-haiku-5.5 is backed by native Anthropic
		// claude-haiku-5-5, canonical UUID ffcde1be-a8de-4c40-b32a-e1fd08d1ad98.
		const destinationModel = body.model === 'claude-haiku-5-5' ? 'claude-haiku-5.5' : body.model;
		const row: any = { model: body.model, destination_model: destinationModel, path, stream: body.stream === true };
		attempts.push(row);
		const response = await fetch('https://api.experientiallabs.ai' + path, {
			method: 'POST',
			headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...body, model: destinationModel }),
			redirect: 'error',
		});
		Object.assign(row, { status: response.status, request_id: response.headers.get('x-request-id') });
		if (!response.ok)
			row.error = await response
				.clone()
				.json()
				.catch(() => ({ message: 'Non-JSON upstream error' }));
		return response;
	},
});
function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message);
}
async function call(body: any) {
	const response = await harness.fetch('/chat/completions', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const raw = await response.text();
	assert(response.ok, 'Worker HTTP ' + response.status + ': ' + raw);
	if (!body.stream) return { data: JSON.parse(raw), served: response.headers.get('x-screenpipe-model') };
	const events = raw
		.split('\n')
		.filter((l) => l.startsWith('data:'))
		.map((l) => l.slice(5).trim())
		.filter((l) => l && l !== '[DONE]')
		.map((l) => JSON.parse(l));
	assert(!events.some((e) => e.error), 'SSE contained an error');
	assert(raw.trimEnd().endsWith('data: [DONE]'), 'SSE missing terminal DONE');
	const finish = events
		.map((e) => e.choices?.[0]?.finish_reason)
		.filter(Boolean)
		.at(-1);
	assert(finish === 'stop', 'SSE did not finish successfully: ' + finish);
	const text = events.map((e) => e.choices?.[0]?.delta?.content ?? '').join('');
	assert(text.trim(), 'SSE had no answer');
	assert(
		events.some((e) => e.usage?.prompt_tokens >= 0 && e.usage?.completion_tokens >= 0),
		'SSE missing usage',
	);
	return { data: { choices: [{ message: { content: text }, finish_reason: finish }] }, served: response.headers.get('x-screenpipe-model') };
}
try {
	for (const model of applicableModels.filter((model) => !selectedModels || selectedModels.includes(model))) {
		for (const mode of modes.filter((mode) => !selectedModes || selectedModes.includes(mode))) {
			const start = attempts.length;
			const body: any = { model, max_tokens: 2048, max_completion_tokens: 2048, messages: [{ role: 'user', content: 'Reply OK.' }] };
			if (mode === 'stream') body.stream = true;
			if (mode === 'tools') Object.assign(body, { tools: [tool], tool_choice: { type: 'function', function: { name: 'confirm' } } });
			if (mode === 'schema')
				Object.assign(body, {
					messages: [{ role: 'user', content: 'Set ok to true.' }],
					response_format: { type: 'json_schema', json_schema: { name: 'confirmation', strict: true, schema }, schema },
				});
			if (mode === 'image')
				body.messages[0].content = [
					{ type: 'text', text: 'Read the four digits in this image. Reply with only the digits.' },
					{ type: 'image_url', image_url: { url: image } },
				];
			const row: any = { model, mode };
			try {
				const { data, served } = await call(body);
				const choice = data.choices?.[0];
				row.served = served;
				assert(model === 'auto' || served === model, 'Explicit model answered by fallback ' + served);
				assert(
					attempts.slice(start).some((a) => a.status === 200 && a.request_id),
					'No live upstream request proved this response',
				);
				if (mode === 'tools') {
					const c = choice?.message?.tool_calls?.[0];
					assert(choice?.finish_reason === 'tool_calls' && c?.function?.name === 'confirm', 'Forced tool call missing');
					const argumentsValue = JSON.parse(c.function.arguments);
					assert(argumentsValue.ok === true && Object.keys(argumentsValue).length === 1, 'Wrong tool arguments');
					const second = await call({
						...body,
						messages: [...body.messages, choice.message, { role: 'tool', tool_call_id: c.id, content: 'Confirmed. Reply OK.' }],
						tool_choice: 'none',
					});
					assert(
						second.data.choices?.[0]?.finish_reason === 'stop' && second.data.choices?.[0]?.message?.content?.trim(),
						'Tool-result turn did not finish',
					);
					assert(model === 'auto' || second.served === model, 'Tool-result turn answered by fallback ' + second.served);
					row.second_tool_turn = true;
				} else {
					assert(choice?.finish_reason === 'stop' && choice?.message?.content?.trim(), 'Missing complete answer');
					if (mode === 'schema') {
						const value = JSON.parse(choice.message.content);
						assert(value.ok === true && Object.keys(value).length === 1, 'Schema result invalid');
					}
					if (mode === 'image') assert(/\b7429\b/.test(choice.message.content), 'Image digits incorrect: ' + choice.message.content);
				}
				row.passed = true;
			} catch (e) {
				row.passed = false;
				row.error = String(e.message).replace(/xpl_[0-9a-f]{40}/g, '[REDACTED_SECRET]');
			}
			row.attempts = attempts.slice(start);
			results.push(row);
			writeFileSync(
				output,
				JSON.stringify(
					{
						boundary:
							'local Screenpipe Worker with synthetic service authentication, migrated D1, installed SDKs and live Experiential inference; not deployed customer routing',
						retained_routes: [...retainedModels],
						results,
					},
					null,
					2,
				),
			);
			console.log(JSON.stringify(row));
		}
	}
	harness.assertNoUnexpectedOutboundRequests();
	console.log(
		JSON.stringify({ summary: true, passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length }),
	);
} finally {
	await harness.dispose();
}
process.exitCode = results.some((r) => !r.passed) ? 1 : 0;
