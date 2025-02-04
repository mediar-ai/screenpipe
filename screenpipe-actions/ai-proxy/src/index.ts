import { Hono } from 'hono';
import { WebSocketPair } from '@cloudflare/workers-types';
import { Env } from './types';
import { RateLimiter } from './rate-limiter';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/realtime-transcription', async (c) => {
	const upgradeHeader = c.req.header('Upgrade');
	if (!upgradeHeader || upgradeHeader !== 'websocket') {
		return c.text('Expected Upgrade: websocket', 426);
	}

	const pair = new WebSocketPair();
	const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

	server.accept();

	let deepgramWs: WebSocket | null = null;

	server.addEventListener('message', async (event: MessageEvent) => {
		try {
			// Create new Deepgram WebSocket if not exists
			if (!deepgramWs) {
				deepgramWs = new WebSocket(c.env.DEEPGRAM_WEBSOCKET_URL);

				deepgramWs.addEventListener('open', () => {
					const options = {
						language: 'en',
						smart_format: true,
						model: 'nova-2',
						encoding: 'linear16',
						channels: 1,
						sample_rate: 16000,
					};
					deepgramWs?.send(JSON.stringify({ options }));
				});

				deepgramWs.addEventListener('message', (dgEvent: MessageEvent) => {
					server.send(dgEvent.data);
				});

				deepgramWs.addEventListener('error', () => {
					server.send(JSON.stringify({ error: 'Deepgram connection error' }));
				});

				deepgramWs.addEventListener('close', () => {
					deepgramWs = null;
				});
			}

			// Forward audio data to Deepgram
			if (deepgramWs?.readyState === WebSocket.OPEN) {
				deepgramWs.send(event.data);
			}
		} catch (error) {
			server.send(JSON.stringify({ error: 'Internal server error' }));
		}
	});

	server.addEventListener('close', () => {
		if (deepgramWs) {
			deepgramWs.close();
			deepgramWs = null;
		}
	});

	return new Response(null, {
		status: 101,
		webSocket: client,
	});
});

export default app;
export { RateLimiter };
