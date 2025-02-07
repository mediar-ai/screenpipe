import type Anthropic from '@anthropic-ai/sdk';

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

export type OpenAITool = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, any>;
			required?: string[];
		};
	};
};

export type AnthropicTool = Anthropic.Tool;

export type GeminiTool = {
	functionDeclarations: Array<{
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, any>;
			required?: string[];
		};
	}>;
};

export interface Tool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, any>;
			required?: string[];
		};
	};
}

export interface RequestBody {
	model: string;
	messages: Message[];
	stream?: boolean;
	tools?: any[];
	temperature?: number;
	tool_choice?: string | { type: 'function'; function: { name: string } };
	response_format?: ResponseFormat;
}

export interface ResponseFormat {
	type: 'text' | 'json_object' | 'json_schema';
	schema?: Record<string, any>;
	name?: string;
}

export interface ImageContent {
	type: 'image';
	image_url: {
		url: string;
		detail?: 'low' | 'high' | 'auto';
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
	NODE_ENV: string;
}
