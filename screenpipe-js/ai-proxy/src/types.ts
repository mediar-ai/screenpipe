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
		parameters: InputSchema
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

type InputSchema = Anthropic.Tool.InputSchema;

export interface ResponseFormat {
	type: 'text' | 'json_object' | 'json_schema';
	schema?: InputSchema;
	name?: string;
	description?: string;
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

export interface ResponseUtils {
	createSuccessResponse: (body: string | object, status?: number) => Response;
	createErrorResponse: (status: number, message: string) => Response;
}

// Supported audio file formats
export type AudioFormat = 'wav' | 'mp3' | 'flac' | 'ogg' | 'webm';

// Supported content types for audio
export type AudioContentType = 
  | 'audio/wav' 
  | 'audio/mpeg'
  | 'audio/flac'
  | 'audio/ogg'
  | 'audio/webm';

// supported deepgram transcription models
export type TranscriptionModelType = 
  | 'nova-2'
  | 'nova-3'
  | 'enhanced'
  | 'whisper';

// supported deepgram TTS voice models
export type TTSVoiceModelType = 
  | 'aura-asteria-en'    
  | 'aura-luna-en'       
  | 'aura-stella-en'     
  | 'aura-athena-en'     
  | 'aura-hera-en'       
  | 'aura-orion-en'    
  | 'aura-arcas-en'    
  | 'aura-perseus-en'  
  | 'aura-angus-en'      
  | 'aura-orpheus-en'  
  | 'aura-helios-en'   
  | 'aura-zeus-en';    

export type AudioEncodingType = 
  | 'linear16'  // WAV format 
  | 'mp3';      // MP3 format

export interface TranscriptionOptions {
  model?: TranscriptionModelType;
  language?: string;
  detectLanguage?: boolean;
  languages?: string[];
  smartFormat?: boolean;
  diarize?: boolean;
  punctuate?: boolean;
  sampleRate?: string;
}

export interface TextToSpeechRequest {
  text: string;
  voice?: TTSVoiceModelType;
}

export interface TTSOptions {
  voice?: TTSVoiceModelType;
  encoding?: AudioEncodingType;
}

export interface TTSWebSocketOptions {
  model: TTSVoiceModelType;
  encoding: AudioEncodingType;
  sampleRate: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
    punctuated_word?: string;
  }>;
  error?: string;
}

export interface VoiceQueryResult {
  transcription: string;
  transcription_details?: {
    confidence: number;
    language?: string;
    words?: any[];
  };
  ai_response: any;
}

export interface TTSBaseMessage {
  type: string;
}

export interface TTSSpeakMessage extends TTSBaseMessage {
  type: 'Speak';
  text: string;
}

export interface TTSFlushMessage extends TTSBaseMessage {
  type: 'Flush';
}

export interface TTSClearMessage extends TTSBaseMessage {
  type: 'Clear';
}

export interface TTSCloseMessage extends TTSBaseMessage {
  type: 'Close';
}

export interface TTSFlushedResponse {
  type: 'Flushed';
  sequence_id: number;
}

export interface TTSClearedResponse {
  type: 'Cleared';
  sequence_id: number;
}

export interface TTSMetadataResponse {
  type: 'Metadata';
  request_id: string;
}

export interface TTSErrorResponse {
  type: 'Error';
  err_code: string;
  err_msg: string;
}

export interface TTSWarningResponse {
  type: 'Warning';
  warn_code: string;
  warn_msg: string;
}

export type TTSWebSocketMessage = 
  | TTSSpeakMessage 
  | TTSFlushMessage 
  | TTSClearMessage 
  | TTSCloseMessage;

export type TTSWebSocketResponse = 
  | TTSFlushedResponse 
  | TTSClearedResponse 
  | TTSMetadataResponse 
  | TTSErrorResponse 
  | TTSWarningResponse;