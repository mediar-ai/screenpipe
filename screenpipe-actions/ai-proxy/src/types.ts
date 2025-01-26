
export interface Message {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | ContentPart[];
	name?: string;
	tool_calls?: ToolCall[];
}

export interface ContentPart {
	type: 'text' | 'image' | 'file';
	text?: string;
	image?: { url: string };
	data?: Uint8Array | string;
	mimeType?: string;
}

export interface ToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface RequestBody {
	model: string;
	messages: Message[];
	stream?: boolean;
	tools?: any[];
	temperature?: number;
	response_format?: {
		type: 'text' | 'json_object';
	};
}

export interface OpenAIResponse {
	choices: Array<{
		message: {
			content: string;
			role: string;
		};
	}>;
}

export interface AnthropicResponse {
	content: Array<{
		text: string;
	}>;
}

export interface GeminiResponse {
	candidates: Array<{
		content: {
			parts: Array<{
				text: string;
			}>;
		};
	}>;
}

export interface Env {
	OPENAI_API_KEY: string;
	LANGFUSE_PUBLIC_KEY: string;
	LANGFUSE_SECRET_KEY: string;
	ANTHROPIC_API_KEY: string;
	DEEPGRAM_API_KEY: string;
	RATE_LIMITER: DurableObjectNamespace;
	CLERK_SECRET_KEY: string;
	GEMINI_API_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
}
