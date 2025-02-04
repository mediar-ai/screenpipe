interface RateLimitData {
	count: number;
	timestamp: number;
}

export class RateLimiter {
	constructor(private state: DurableObjectState, private env: any) {}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const clientId = url.searchParams.get('clientId') || 'anonymous';

		let data = (await this.state.storage.get<RateLimitData>(clientId)) || { count: 0, timestamp: Date.now() };
		// Reset counter if it's been more than a minute
		if (Date.now() - (data.timestamp ?? Date.now()) > 60000) {
			data = { count: 0, timestamp: Date.now() };
		}

		// Increment counter
		data.count++;
		await this.state.storage.put(clientId, data);

		// Check if rate limit exceeded
		if (data.count > 100) {
			// 100 requests per minute
			return new Response('Rate limit exceeded', { status: 429 });
		}

		return new Response('OK');
	}
}
