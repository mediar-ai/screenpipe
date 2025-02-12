import { OpenAI } from "openai"
import type { Settings } from "@screenpipe/browser"
import pThrottle from "p-throttle"

interface RetryOptions {
    maxRetries?: number
    initialDelay?: number
}

// Create throttled OpenAI client to handle rate limits
const throttle = pThrottle({
    limit: 3, // max concurrent requests
    interval: 1000, // per second
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

            // Handle different error types
            if (error.status === 429) { // Rate limit
                const delay = initialDelay * Math.pow(2, attempt)
                console.log(`rate limit hit, waiting ${delay}ms before retry`)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
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