import { Env, TextToSpeechRequest, VoiceQueryResult, TranscriptionOptions, TTSOptions, TTSVoiceModelType, TranscriptionModelType } from '../types';
import { transcribeAudio, textToSpeech, validateAudioInput } from '../utils/voice-utils';
import { createProvider } from '../providers';
import { Langfuse } from 'langfuse-node';
import { createSuccessResponse, createErrorResponse, addCorsHeaders } from '../utils/cors';

/**
 * Handles voice input transcription requests
 * @param request The HTTP request containing audio data
 * @param env Environment variables
 * @returns Response with transcription result
 */
export async function handleVoiceTranscription(request: Request, env: Env): Promise<Response> {
  const validation = await validateAudioInput(request);
  if (!validation.valid || !validation.audioBuffer) {
    return createErrorResponse(400, validation.error || 'Invalid audio input');
  }
  
  const languages = request.headers.get('detect_language')?.split(',') || ['en'];
  const sampleRate = request.headers.get('sample_rate') || '16000';
  const model: TranscriptionModelType = request.headers.get('transcription_model') as TranscriptionModelType || 'nova-3';
  const diarize = request.headers.get('diarize') === 'true';
  
  // Transcribe audio
  const transcriptionResult = await transcribeAudio(validation.audioBuffer, env, {
    languages,
    sampleRate,
    model,
    diarize,
    smartFormat: true
  });
  
  if (transcriptionResult.error || !transcriptionResult.text) {
    return createErrorResponse(
      400, 
      transcriptionResult.error || 'No speech detected in the audio'
    );
  }
  
  return createSuccessResponse({
    transcription: transcriptionResult.text,
    confidence: transcriptionResult.confidence,
    language: transcriptionResult.language,
    words: transcriptionResult.words
  });
}

/**
 * Handles voice query requests (audio in, AI text response out)
 * @param request HTTP request with audio data
 * @param env Environment variables
 * @param langfuse Analytics client
 * @returns HTTP response with transcription and AI response
 */
export async function handleVoiceQuery(request: Request, env: Env, langfuse: Langfuse): Promise<Response> {
	const trace = langfuse.trace({
		id: 'voice_query_' + Date.now(),
		name: 'voice_query',
		metadata: {
			input_type: 'audio',
		},
	});

	try {
		const validation = await validateAudioInput(request);
		if (!validation.valid || !validation.audioBuffer) {
			return createErrorResponse(400, validation.error || 'Invalid audio input');
		}

		const transcriptionOptions: TranscriptionOptions = {
			model: (request.headers.get('transcription-model') as TranscriptionOptions['model']) || 'nova-3',
			languages: request.headers.get('detect_language')?.split(',') || ['en'],
			sampleRate: request.headers.get('sample_rate') || '16000',
			smartFormat: true,
			diarize: request.headers.get('diarize') === 'true',
			punctuate: request.headers.get('punctuate') !== 'false',
		};

		const aiModel = request.headers.get('ai-model') || 'gpt-4o';
		const systemPrompt = request.headers.get('system-prompt') || 'You are a helpful assistant.';

		const transcriptionResult = await transcribeAudio(validation.audioBuffer, env, transcriptionOptions);

		trace.update({
			metadata: {
				transcription: transcriptionResult.text,
				confidence: transcriptionResult.confidence,
				language: transcriptionResult.language,
				transcription_time: new Date().toISOString(),
			},
		});

		if (transcriptionResult.error || !transcriptionResult.text) {
			return createErrorResponse(400, transcriptionResult.error || 'No speech detected in the audio');
		}

		const provider = createProvider(aiModel, env);

		const aiResponseData = await provider.createCompletion({
			model: aiModel,
			messages: [
				{
					role: 'system',
					content: systemPrompt,
				},
				{
					role: 'user',
					content: transcriptionResult.text,
				},
			],
			stream: false,
		});

		const aiResponse = await aiResponseData.json();

		trace.update({
			metadata: {
				model_used: aiModel,
				completion_time: new Date().toISOString(),
				completion_status: 'success',
			},
			output: aiResponse,
		});

		const result: VoiceQueryResult = {
			transcription: transcriptionResult.text,
			transcription_details: {
				confidence: transcriptionResult.confidence,
				language: transcriptionResult.language,
				words: transcriptionResult.words,
			},
			ai_response: aiResponse,
		};

		return createSuccessResponse(result);
	} catch (error: any) {
		console.error('Error in voice query:', error);

		trace.update({
			metadata: {
				error: error.message,
				error_time: new Date().toISOString(),
			},
		});

		return createErrorResponse(500, `Error processing voice query: ${error.message}`);
	}
}

/**
 * Handles text-to-speech conversion (REST API)
 * @param request HTTP request with text to convert
 * @param env Environment variables
 * @param langfuse Analytics client
 * @returns HTTP response with audio data
 */
export async function handleTextToSpeech(request: Request, env: Env, langfuse: Langfuse): Promise<Response> {
	const trace = langfuse.trace({
		id: 'text_to_speech_' + Date.now(),
		name: 'text_to_speech',
		metadata: {
			input_type: 'text',
		},
	});

	try {
		const { text, voice = 'aura-asteria-en' } = (await request.json()) as TextToSpeechRequest;

		if (!text || typeof text !== 'string') {
			return createErrorResponse(400, 'Missing or invalid text parameter');
		}

		if (voice && !isValidVoiceModel(voice)) {
			return createErrorResponse(400, `Invalid voice model: ${voice}. See documentation for supported models.`);
		}

		trace.update({
			metadata: {
				text_length: text.length,
				voice: voice,
			},
		});

		const ttsOptions: TTSOptions = {
			voice: voice as TTSVoiceModelType,
			encoding: 'linear16', // Default to WAV format
		};

		const audioBuffer = await textToSpeech(text, env, ttsOptions);

		if (!audioBuffer) {
			return createErrorResponse(500, 'Failed to convert text to speech');
		}

		trace.update({
			metadata: {
				tts_status: 'success',
				audio_size_bytes: audioBuffer.byteLength,
				completion_time: new Date().toISOString(),
			},
		});

		const response = new Response(audioBuffer, {
			headers: {
				'Content-Type': 'audio/wav',
			},
		});

		return addCorsHeaders(response);
	} catch (error: any) {
		console.error('Error in text-to-speech:', error);

		trace.update({
			metadata: {
				tts_status: 'error',
				error: error.message,
				error_time: new Date().toISOString(),
			},
		});

		return createErrorResponse(500, `Error converting text to speech: ${error.message}`);
	}
}

/**
 * Handles voice chat requests (audio in, audio out)
 * @param request HTTP request with audio data
 * @param env Environment variables
 * @param langfuse Analytics client
 * @returns HTTP response with audio data
 */
export async function handleVoiceChat(request: Request, env: Env, langfuse: Langfuse): Promise<Response> {
	const trace = langfuse.trace({
		id: 'voice_chat_' + Date.now(),
		name: 'voice_chat',
		metadata: {
			input_type: 'audio',
			output_type: 'audio',
		},
	});

	try {
		const validation = await validateAudioInput(request);
		if (!validation.valid || !validation.audioBuffer) {
			return createErrorResponse(400, validation.error || 'Invalid audio input');
		}

		const transcriptionOptions: TranscriptionOptions = {
			model: (request.headers.get('transcription-model') as TranscriptionOptions['model']) || 'nova-3',
			languages: request.headers.get('detect_language')?.split(',') || ['en'],
			sampleRate: request.headers.get('sample_rate') || '16000',
			smartFormat: true,
			diarize: request.headers.get('diarize') === 'true',
			punctuate: request.headers.get('punctuate') !== 'false',
		};

		const aiModel = request.headers.get('ai-model') || 'gpt-4o';
		const systemPrompt = request.headers.get('system-prompt') || 'You are a helpful assistant. Keep your responses concise.';
		const voice = (request.headers.get('voice') as TTSVoiceModelType) || 'aura-asteria-en';

		if (!isValidVoiceModel(voice)) {
			return createErrorResponse(400, `Invalid voice model: ${voice}. See documentation for supported models.`);
		}

		const transcriptionResult = await transcribeAudio(validation.audioBuffer, env, transcriptionOptions);

		trace.update({
			metadata: {
				transcription: transcriptionResult.text,
				confidence: transcriptionResult.confidence,
				language: transcriptionResult.language,
				transcription_time: new Date().toISOString(),
			},
		});

		if (transcriptionResult.error || !transcriptionResult.text) {
			return createErrorResponse(400, transcriptionResult.error || 'No speech detected in the audio');
		}

		const provider = createProvider(aiModel, env);

		const aiResponseData = await provider.createCompletion({
			model: aiModel,
			messages: [
				{
					role: 'system',
					content: systemPrompt,
				},
				{
					role: 'user',
					content: transcriptionResult.text,
				},
			],
			stream: false,
		});

		const aiResponseJson: any = await aiResponseData.json();
		const aiResponseText = aiResponseJson.choices[0]?.message?.content || '';

		trace.update({
			metadata: {
				model_used: aiModel,
				ai_completion_time: new Date().toISOString(),
				ai_response_length: aiResponseText.length,
			},
		});

		const ttsOptions: TTSOptions = {
			voice: voice,
			encoding: 'linear16', // WAV format
		};

		const audioBuffer = await textToSpeech(aiResponseText, env, ttsOptions);

		if (!audioBuffer) {
			return createErrorResponse(500, 'Failed to convert AI response to speech');
		}

		trace.update({
			metadata: {
				tts_status: 'success',
				audio_size_bytes: audioBuffer.byteLength,
				completion_time: new Date().toISOString(),
			},
		});

		const response = new Response(audioBuffer, {
			headers: {
				'Content-Type': 'audio/wav',
				'X-Transcription': transcriptionResult.text,
				'X-AI-Response': aiResponseText,
				'Access-Control-Expose-Headers': 'X-Transcription, X-AI-Response',
			},
		});

		return addCorsHeaders(response);
	} catch (error: any) {
		console.error('Error in voice chat:', error);

		trace.update({
			metadata: {
				error: error.message,
				error_time: new Date().toISOString(),
			},
		});

		return createErrorResponse(500, `Error processing voice chat: ${error.message}`);
	}
}

/**
 * Validates if a string is a valid voice model
 * @param voice Voice model to validate
 * @returns True if valid, false otherwise
 */
function isValidVoiceModel(voice: string): voice is TTSVoiceModelType {
	const validVoices: TTSVoiceModelType[] = [
		'aura-asteria-en',
		'aura-luna-en',
		'aura-stella-en',
		'aura-athena-en',
		'aura-hera-en',
		'aura-orion-en',
		'aura-arcas-en',
		'aura-perseus-en',
		'aura-angus-en',
		'aura-orpheus-en',
		'aura-helios-en',
		'aura-zeus-en',
	];

	return validVoices.includes(voice as TTSVoiceModelType);
}
