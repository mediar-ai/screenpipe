import { OpenAI } from "openai"
import type { Settings } from "@/lib/types"
import pThrottle from "p-throttle"

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

// Add request lock
const requestState = {
  isProcessing: false
}

export function createAiClient(settings: Settings) {
    console.log("creating ai client with settings:", {
        aiProviderType: settings?.aiProviderType,
        hasUserToken: !!settings?.user?.token,
        hasOpenaiKey: !!settings?.openaiApiKey,
        aiUrl: settings?.aiUrl
    })

    if (!settings) {
        console.error("settings is undefined when creating ai client")
        throw new Error("settings required for ai client")
    }

    // Always use screenpipe-cloud with Claude
    settings.aiProviderType = "screenpipe-cloud"
    settings.aiModel = "gpt-4o-mini-2024-07-18"

    const apiKey = settings.user?.token 

    if (!apiKey) {
        console.error("no api key available", {
            type: settings.aiProviderType,
            hasUserToken: !!settings.user?.token,
            hasOpenaiKey: !!settings.openaiApiKey,
            aiUrl: settings.aiUrl
        })
        throw new Error("api key required for ai client")
    }

    console.log("ai client created successfully with provider:", {
        type: settings.aiProviderType,
        baseUrl: settings.aiUrl
    })

    return new OpenAI({
        apiKey,
        baseURL: "https://ai-proxy.i-f9f.workers.dev/v1",
        dangerouslyAllowBrowser: true,
    })
}

// Remove RetryOptions interface and simplify callOpenAI
export const callOpenAI = throttle(async (
    openai: OpenAI,
    params: Parameters<typeof openai.chat.completions.create>[0]
) => {
    // Check if already processing
    if (requestState.isProcessing) {
        console.log('skipping request - another request is in progress')
        throw new Error('request already in progress')
    }

    // Check backoff
    if (Date.now() < rateLimitState.backoffUntil) {
        throw new Error('rate limit backoff in progress')
    }

    try {
        requestState.isProcessing = true
        console.log('starting ai request')
        const result = await openai.chat.completions.create(params)
        console.log('ai request completed successfully')
        return result
    } catch (error: any) {
        console.warn('ai call failed:', {
            error: error.message,
            status: error.status,
            type: error.type
        })

        if (error.status === 429) { // Rate limit
            rateLimitState.isLimited = true
            rateLimitState.backoffUntil = Date.now() + 2000 // Simple 2s backoff
            console.log(`rate limit hit, backing off until ${new Date(rateLimitState.backoffUntil).toISOString()}`)
        }
        
        throw error
    } finally {
        requestState.isProcessing = false
    }
}) 