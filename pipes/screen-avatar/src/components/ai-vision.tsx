"use client";

import { usePipeSettings } from "../lib/hooks/use-pipe-settings";
import { createAiClient, callOpenAI } from "../lib/hooks/ai-client";

interface VisionAnalysis {
    description: string[]
    fun_activity_detected?: string
    confidence?: string
    detected_apps?: string[]
    reasoning?: string
}

export async function analyzeImage(
    imageUrl: string,
    prompt: string,
    settings: Settings
): Promise<VisionAnalysis> {
    const openai = createAiClient(settings)
    
    try {
        console.log("analyzing image:", {
            url: imageUrl,
            prompt,
            model: settings.aiModel
        })

        const response = await callOpenAI(openai, {
            model: settings.aiModel,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: prompt
                        },
                        {
                            type: "text",
                            text: imageUrl
                        }
                    ]
                }
            ],
            temperature: 0.1,
            max_tokens: 500,
        })

        const content = response?.choices[0]?.message?.content || ""
        
        try {
            // Try to parse as JSON first
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[0])
                return {
                    description: [content], // Keep full response
                    ...jsonData
                }
            }
        } catch (err) {
            console.warn('failed to parse json response:', err)
        }

        // Fallback to original parsing
        return {
            description: [content],
        }

    } catch (error) {
        console.error("error analyzing image:", error)
        return {
            description: [],
        }
    }
}

export function useVisionAnalysis() {
    const { settings } = usePipeSettings()
    
    const analyze = async (imageUrl: string, prompt: string) => {
        return analyzeImage(imageUrl, prompt, settings)
    }

    return { analyze }
}
