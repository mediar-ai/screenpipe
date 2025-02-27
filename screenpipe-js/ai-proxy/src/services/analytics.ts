import { Langfuse } from 'langfuse-node';
import { Env } from '../types';

/**
 * Sets up and configures the analytics service
 * @param env Environment variables
 * @returns Configured Langfuse instance
 */
export function setupAnalytics(env: Env): Langfuse {
  const langfuse = new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: 'https://us.cloud.langfuse.com',
  });

  langfuse.debug();
  langfuse.on('error', (error) => {
    console.error('langfuse error:', error);
  });

  return langfuse;
}