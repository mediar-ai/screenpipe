"use client";

import { usePipeSettings } from "../lib/hooks/use-pipe-settings";
import { createAiClient, callOpenAI } from "../lib/hooks/ai-client";

interface Step {
    step: string
    task: string
}

interface TranscriptionAnalysis {
    steps: Step[]
    reasoning?: string
}

export async function analyzeTranscription(
    text: string,
    prompt: string,
    settings: Settings
): Promise<TranscriptionAnalysis> {
    const openai = createAiClient(settings)
    
    try {
        console.log("analyzing transcription:", {
            text,
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
                            text: `${prompt}\nUser said: ${text}\nReturn a JSON with an array of steps, where each step has 'step_#' (step number) and 'task' (10 word description) fields.`
                        }
                    ]
                }
            ],
            temperature: 0.1,
            max_tokens: 500,
        })

        const content = response?.choices[0]?.message?.content || ""
        console.log('raw ai response:', content)
        
        try {
            // Try to parse the entire content first
            let parsed = null
            try {
                parsed = JSON.parse(content)
            } catch {
                // Fallback: try to extract JSON from markdown or text
                const jsonMatch = content.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0])
                }
            }

            if (parsed) {
                // Handle both array and object formats
                let steps = []
                
                if (Array.isArray(parsed.steps)) {
                    // Handle array format: {steps: [{step_1: 'task'}, {step_2: 'task'}]}
                    steps = parsed.steps.map((stepObj, idx) => {
                        const [step, task] = Object.entries(stepObj)[0]
                        return {
                            step: step.replace('step_', ''),
                            task: typeof task === 'string' ? task : JSON.stringify(task)
                        }
                    })
                } else {
                    // Handle object format: {step_1: 'task', step_2: 'task'}
                    steps = Object.entries(parsed)
                        .filter(([key]) => key.startsWith('step_'))
                        .map(([step, task]) => ({
                            step: step.replace('step_', ''),
                            task: typeof task === 'string' ? task : JSON.stringify(task)
                        }))
                }
                
                if (steps.length === 0) {
                    console.warn('no steps found in response:', parsed)
                    return {
                        steps: [{
                            step: "error",
                            task: "no steps found in AI response"
                        }]
                    }
                }
                
                console.log('transformed steps:', steps)
                return { steps }
            }
            
            console.warn('invalid response format:', content)
            
            return {
                steps: [{
                    step: "error",
                    task: "failed to parse AI response"
                }]
            }

        } catch (err) {
            console.warn('failed to parse json response:', err)
            return {
                steps: [{
                    step: "error",
                    task: "failed to parse AI response"
                }]
            }
        }

    } catch (error) {
        console.error("error analyzing transcription:", error)
        return {
            steps: [{
                step: "error",
                task: "AI analysis failed"
            }]
        }
    }
}

export function useTranscriptionAnalysis() {
    const { settings } = usePipeSettings()
    
    const analyze = async (text: string, prompt: string) => {
        return analyzeTranscription(text, prompt, settings)
    }

    return { analyze }
}
