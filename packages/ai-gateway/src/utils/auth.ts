import { verifyToken } from '@clerk/backend';
import { Env, AuthResult, UserTier } from '../types';
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
 * Extracts device ID from request headers
 * Falls back to IP address if no device ID is provided
 */
function getDeviceId(request: Request): string {
  const deviceId = request.headers.get('X-Device-Id');
  if (deviceId && deviceId.length > 0) {
    return deviceId;
  }
  // Fall back to IP address for backwards compatibility
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

/**
 * Validates user authentication from request headers and determines tier
 * @param request HTTP request
 * @param env Environment variables
 * @returns AuthResult with tier information
 */
export async function validateAuth(request: Request, env: Env): Promise<AuthResult> {
  const deviceId = getDeviceId(request);
  const authHeader = request.headers.get('Authorization');

  // No auth header = anonymous tier (free usage)
  if (!authHeader || !(authHeader.startsWith('Bearer ') || authHeader.startsWith('Token '))) {
    return {
      isValid: true,
      tier: 'anonymous',
      deviceId,
    };
  }

  const token = authHeader.split(' ')[1];

  // Allow test token in development mode
  if (env.NODE_ENV === 'development' && token === 'test-token') {
    console.log('using test token in development mode');
    return {
      isValid: true,
      tier: 'subscribed',
      deviceId,
      userId: 'test-user',
    };
  }

  // Check if user has active subscription
  const { isValid: hasSubscription, userId } = await validateSubscriptionWithId(env, token);

  if (hasSubscription) {
    return {
      isValid: true,
      tier: 'subscribed',
      deviceId,
      userId,
    };
  }

  // UUID user without subscription = logged_in tier
  // (they provided a valid Supabase user ID, just not subscribed)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_REGEX.test(token)) {
    console.log('UUID token detected without subscription, granting logged_in tier');
    return {
      isValid: true,
      tier: 'logged_in',
      deviceId,
      userId: userId || token,
    };
  }

  // Clerk user ID without subscription = logged_in tier
  // (won't pass JWT verification below, so catch it here)
  const CLERK_ID_PATTERN = /^user_[a-zA-Z0-9]+$/;
  if (CLERK_ID_PATTERN.test(token)) {
    return {
      isValid: true,
      tier: 'logged_in',
      deviceId,
      userId: token,
    };
  }

  // Check if it's a valid Clerk token (logged in but no subscription)
  const isClerkValid = await verifyClerkToken(env, token);
  if (isClerkValid) {
    return {
      isValid: true,
      tier: 'logged_in',
      deviceId,
      userId: token, // Use token as identifier
    };
  }

  // Check if it's a valid screenpipe JWT token
  const screenpipeUser = await validateScreenpipeToken(token);
  if (screenpipeUser.isValid) {
    // Check if the user has subscription
    if (screenpipeUser.hasSubscription) {
      return {
        isValid: true,
        tier: 'subscribed',
        deviceId,
        userId: screenpipeUser.userId,
      };
    }
    // Logged in but no subscription
    return {
      isValid: true,
      tier: 'logged_in',
      deviceId,
      userId: screenpipeUser.userId,
    };
  }

  // Invalid token provided = still allow as anonymous
  // This is a design choice: we don't want to block users with expired tokens
  console.log('Token validation failed, falling back to anonymous tier');
  return {
    isValid: true,
    tier: 'anonymous',
    deviceId,
  };
}

/**
 * Legacy validateAuth for backwards compatibility
 * Returns simple isValid/error format
 */
export async function validateAuthLegacy(request: Request, env: Env): Promise<{ isValid: boolean; error?: string }> {
  const result = await validateAuth(request, env);
  return {
    isValid: result.isValid,
    error: result.error,
  };
}

/**
 * Validates subscription and returns user ID
 */
async function validateSubscriptionWithId(env: Env, token: string): Promise<{ isValid: boolean; userId?: string }> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CLERK_USER_ID_REGEX = /^user_[a-zA-Z0-9]+$/;

  // Check by UUID (Supabase user ID)
  if (UUID_REGEX.test(token)) {
    try {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/has_active_cloud_subscription`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input_user_id: token }),
      });

      if (!response.ok) {
        console.error('Supabase error:', await response.text());
        return { isValid: false };
      }

      const hasSubscription: boolean = await response.json();
      return { isValid: hasSubscription, userId: token };
    } catch (error) {
      console.error('Error checking subscription:', error);
      return { isValid: false };
    }
  }

  // Clerk user IDs - check actual subscription via Supabase
  if (CLERK_USER_ID_REGEX.test(token)) {
    console.log('Clerk user ID detected, checking subscription:', token);
    try {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/has_active_cloud_subscription`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input_user_id: token }),
      });
      if (response.ok) {
        const hasSubscription: boolean = await response.json();
        if (hasSubscription) {
          return { isValid: true, userId: token };
        }
      }
    } catch (error) {
      console.error('Error checking Clerk user subscription:', error);
    }
    // Not subscribed - don't auto-grant, return false so it falls through
    return { isValid: false, userId: token };
  }

  return { isValid: false };
}

/**
 * Validates a screenpipe JWT token
 */
interface ScreenpipeUserData {
  id?: string;
  email?: string;
  cloud_subscribed?: boolean;
}

async function validateScreenpipeToken(token: string): Promise<{ isValid: boolean; userId?: string; hasSubscription?: boolean }> {
  if (!token.startsWith('eyJ')) {
    return { isValid: false };
  }

  try {
    const response = await fetch('https://screenpi.pe/api/user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      const data = await response.json() as { success?: boolean; user?: ScreenpipeUserData };
      const userData = data.user;
      console.log('Valid screenpipe user token, user:', userData?.email);
      return {
        isValid: true,
        userId: userData?.id || userData?.email,
        hasSubscription: userData?.cloud_subscribed === true,
      };
    } else {
      console.log('Invalid screenpipe user token');
      return { isValid: false };
    }
  } catch (error) {
    console.error('Error validating screenpipe token:', error);
    return { isValid: false };
  }
}
