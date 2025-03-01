import { OpenAI } from "openai"
import type { Settings } from "@screenpipe/browser"
import pThrottle from "p-throttle"

interface RetryOptions {
    maxRetries?: number
    initialDelay?: number
}

// Add rate limit tracking
const rateLimitState = {
    isLimited: false,
    resetTime: 0,
    backoffUntil: 0
}

// Update throttle to be more conservative
const throttle = pThrottle({
    limit: 2, // reduced from 3
    interval: 2000, // increased from 1000
})

export function createAiClient(settings: Settings) {
    return new OpenAI({
        apiKey: settings.aiProviderType === "screenpipe-cloud" 
            ? settings.user.token 
            : settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
    })
}

// Throttled wrapper for OpenAI calls with retry logic
export const callOpenAI = throttle(async (
    openai: OpenAI,
    params: Parameters<typeof openai.chat.completions.create>[0],
    options: RetryOptions = {}
) => {
    const { maxRetries = 3, initialDelay = 1000 } = options
    let lastError: Error | null = null
    
    // Check if we're in backoff period
    if (Date.now() < rateLimitState.backoffUntil) {
        throw new Error('rate limit backoff in progress')
    }
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await openai.chat.completions.create(params)
        } catch (error: any) {
            lastError = error
            console.warn(`ai call failed (attempt ${attempt + 1}/${maxRetries}):`, {
                error: error.message,
                status: error.status,
                type: error.type
            })

            if (error.status === 429) { // Rate limit
                rateLimitState.isLimited = true
                rateLimitState.backoffUntil = Date.now() + (initialDelay * Math.pow(2, attempt))
                console.log(`rate limit hit, backing off until ${new Date(rateLimitState.backoffUntil).toISOString()}`)
                throw error // Don't retry on rate limit, let caller handle
            }
            
            if (error.status === 503) { // Service unavailable
                const delay = initialDelay * Math.pow(1.5, attempt)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
            }

            // Don't retry on auth errors or invalid requests
            if (error.status === 401 || error.status === 400) {
                throw error
            }
        }
    }
    
    throw lastError || new Error('max retries exceeded')
}) 