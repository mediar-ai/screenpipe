import { createClient, DeepgramClient } from '@deepgram/sdk';
import { Env } from '../types';

let deepgramClientInstance: DeepgramClient | null = null;

export function getDeepgramClient(env: Env): DeepgramClient {
  if (!deepgramClientInstance) {
    deepgramClientInstance = createClient(env.DEEPGRAM_API_KEY);
  }
  return deepgramClientInstance;
}