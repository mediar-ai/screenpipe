import { verifyToken } from '@clerk/backend';
import { Env } from '../types';
import { validateSubscription } from './subscription';

/**
 * Verifies a JWT token from Clerk
 * @param env Environment variables
 * @param token JWT token to verify
 * @returns Promise resolving to boolean indicating if token is valid
 */
export async function verifyClerkToken(env: Env, token: string): Promise<boolean> {
  console.log('verifying clerk token', token);
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    return payload.sub !== null;
  } catch (error) {
    console.error('clerk verification failed:', error);
    return false;
  }
}

/**
 * Validates user authentication from request headers
 * @param request HTTP request
 * @param env Environment variables
 * @returns Object with validation result and optional error message
 */
export async function validateAuth(request: Request, env: Env): Promise<{ isValid: boolean; error?: string }> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !(authHeader.startsWith('Bearer ') || authHeader.startsWith('Token '))) {
    return { isValid: false, error: 'unauthorized' };
  }

  const token = authHeader.split(' ')[1];
  let isValid = await validateSubscription(env, token);

  // If not valid, try to verify as a clerk token
  if (!isValid) {
    isValid = await verifyClerkToken(env, token);
  }

  if (!isValid) {
    console.log('all validation attempts failed');
    return { isValid: false, error: 'invalid subscription' };
  }

  return { isValid: true };
}