import { Langfuse } from 'langfuse-node';
import { Env } from '../types';

/**
 * Sets up and configures the analytics service
 * @param env Environment variables
 * @returns Configured Langfuse instance or no-op stub if credentials missing
 */
export function setupAnalytics(env: Env): Langfuse {
  // Skip Langfuse if credentials are missing or placeholders
  const placeholders = ['placeholder', 'dummy', ''];
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY ||
      placeholders.includes(env.LANGFUSE_PUBLIC_KEY) || placeholders.includes(env.LANGFUSE_SECRET_KEY)) {
    console.log('Langfuse credentials missing, using stub');
    // Return a no-op stub that matches the Langfuse interface
    const stub = {
      trace: () => ({ update: () => {}, span: () => ({ end: () => {} }), generation: () => ({ end: () => {} }) }),
      span: () => ({ end: () => {} }),
      generation: () => ({ end: () => {} }),
      debug: () => {},
      on: () => {},
      shutdownAsync: async () => {},
      flushAsync: async () => {},
    };
    return stub as unknown as Langfuse;
  }

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
