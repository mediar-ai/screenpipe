import { Hono } from 'hono';
import { Env } from './types';

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
			if (!deepgramWs) {
				const url = new URL(c.env.DEEPGRAM_WEBSOCKET_URL);
				url.searchParams.append('encoding', 'linear16');
				url.searchParams.append('sample_rate', '16000');

				const protocols = [`Authorization: Token ${c.env.DEEPGRAM_API_KEY}`];
				deepgramWs = new WebSocket(url.toString(), protocols);

				deepgramWs.addEventListener('open', () => {
					console.log('deepgram connection opened');
				});

				deepgramWs.addEventListener('message', (dgEvent: MessageEvent) => {
					server.send(dgEvent.data);
				});

				deepgramWs.addEventListener('error', (error) => {
					console.error('deepgram error:', error);
					server.send(JSON.stringify({ error: 'Deepgram connection error' }));
				});

				deepgramWs.addEventListener('close', () => {
					console.log('deepgram connection closed');
					deepgramWs = null;
				});
			}

			if (deepgramWs?.readyState === WebSocket.OPEN) {
				deepgramWs.send(event.data);
			}
		} catch (error) {
			console.error('error:', error);
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
