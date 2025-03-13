import { Env } from '../types';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { createSuccessResponse, createErrorResponse } from '../utils/cors';

/**
 * Handles audio file transcription requests
 * @param request The HTTP request containing audio data
 * @param env Environment variables
 * @returns Response with transcription results
 */
export async function handleFileTranscription(request: Request, env: Env): Promise<Response> {
  try {
    const audioBuffer = await request.arrayBuffer();
    const languages = request.headers.get('detect_language')?.split(',') || [];
    const sampleRate = request.headers.get('sample_rate') || '16000';
    
    const deepgramResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&sample_rate=' +
        sampleRate +
        (languages.length > 0 ? '&' + languages.map((lang) => `detect_language=${lang}`).join('&') : ''),
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/wav', 
        },
        body: audioBuffer,
      }
    );

    if (!deepgramResponse.ok) {
      const errorData = await deepgramResponse.json();
      throw new Error(`Deepgram API error: ${JSON.stringify(errorData)}`);
    }

    const data: string | object = await deepgramResponse.json();
    return createSuccessResponse(data);
  } catch (error: any) {
    console.error('Error in Deepgram request:', error);
    return createErrorResponse(500, error.message);
  }
}

/**
 * Handles WebSocket upgrade for real-time transcription
 * @param request The HTTP request for WebSocket upgrade
 * @param env Environment variables
 * @returns Response with WebSocket connection
 */
export async function handleWebSocketUpgrade(request: Request, env: Env): Promise<Response> {
  try {
    const requestId = crypto.randomUUID();

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.accept();

    let params = new URL(request.url).searchParams;
    let url = new URL('wss://api.deepgram.com/v1/listen');
    
    for (let [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }

    let deepgram = createClient(env.DEEPGRAM_API_KEY);
    let deepgramSocket = deepgram.listen.live({}, url.toString());

    deepgramSocket.on(LiveTranscriptionEvents.Open, () => {
      server.send(
        JSON.stringify({
          type: 'connected',
          message: 'WebSocket connection established',
        })
      );
    });

    server.addEventListener('message', (event) => {
      if (deepgramSocket.getReadyState() === WebSocket.OPEN) {
        deepgramSocket.send(event.data);
      }
    });

    deepgramSocket.on(LiveTranscriptionEvents.Transcript, (data) => {
      if (server.readyState === WebSocket.OPEN) {
        server.send(JSON.stringify(data));
      }
    });

    server.addEventListener('close', () => {
      deepgramSocket.requestClose();
    });

    deepgramSocket.on(LiveTranscriptionEvents.Error, (error) => {
      if (server.readyState === WebSocket.OPEN) {
        server.close(1011, 'Deepgram error: ' + error.message);
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'dg-request-id': requestId,
      },
    });
  } catch (error) {
    console.error('WebSocket upgrade failed:', error);
    return createErrorResponse(500, 'WebSocket upgrade failed');
  }
}