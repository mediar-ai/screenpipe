export interface Env {
	DEEPGRAM_WEBSOCKET_URL: string;
	RATE_LIMITER: DurableObjectNamespace;
	SUPABASE_URL?: string;
	SUPABASE_ANON_KEY?: string;
	CLERK_SECRET_KEY?: string;
}
