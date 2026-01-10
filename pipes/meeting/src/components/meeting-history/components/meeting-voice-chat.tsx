import { Button } from "@/components/ui/button"
import { Mic, MicOff, Send, X, MessageSquare, Loader2 } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { LiveMeetingData } from "@/components/live-transcription/hooks/storage-for-live-meeting"
import { useSettings } from "@/lib/hooks/use-settings"
import { createAiClient, callOpenAI } from "../../live-transcription/hooks/ai-client"
import { motion, AnimatePresence } from "framer-motion"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import React from "react"

interface Message {
    role: 'user' | 'assistant'
    content: string
    id: string
}

export function MeetingVoiceChat({ meeting }: { meeting: LiveMeetingData }) {
    const { settings } = useSettings()
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || isLoading) return

        const userMsg: Message = { role: 'user', content: input, id: crypto.randomUUID() }
        setMessages((prev: Message[]) => [...prev, userMsg])
        setInput("")
        setIsLoading(true)

        try {
            const openai = createAiClient(settings)

            // Prepare context from meeting
            const transcript = meeting.chunks.map(c =>
                `[${c.timestamp}] ${c.speaker}: ${c.text}`
            ).join('\n')

            const systemPrompt = `You are a helpful assistant answering questions about a specific meeting.
      
      Context:
      Title: ${meeting.title || 'Untitled Meeting'}
      Time: ${meeting.startTime}
      
      Transcript:
      ${transcript.slice(0, 100000)} // truncate to avoid token limits if vast
      
      Answer the user's question based ONLY on the transcript above. If the answer isn't in the transcript, say so.`

            const response = await callOpenAI(openai, {
                model: settings.aiModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages.slice(-4).map((m: Message) => ({ role: m.role, content: m.content })),
                    { role: "user", content: userMsg.content }
                ],
                temperature: 0.7,
            })

            const answer = response?.choices?.[0]?.message?.content || "I couldn't generate an answer."

            setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: answer, id: crypto.randomUUID() }])

        } catch (error) {
            console.error('Failed to chat:', error)
            setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: "Error: Failed to connect to AI.", id: crypto.randomUUID() }])
        } finally {
            setIsLoading(false)
        }
    }

    // Basic implementation of Voice Input (Web Speech API)
    const toggleListening = () => {
        if (isListening) {
            setIsListening(false)
            return
        }

        if (!('webkitSpeechRecognition' in window)) {
            alert("Voice input not supported in this browser.")
            return
        }

        const recognition = new (window as any).webkitSpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false

        recognition.onstart = () => setIsListening(true)
        recognition.onend = () => setIsListening(false)
        recognition.onresult = (event: any) => {
            const text = event.results[0][0].transcript
            setInput(text)
        }

        recognition.start()
    }

    return (
        <div className="relative inline-block">
            <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-blue-500 hover:text-blue-600"
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsOpen(!isOpen)
                }}
            >
                <MessageSquare className="h-4 w-4" />
            </Button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 top-8 z-50 w-80 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Card className="flex flex-col h-96 overflow-hidden border-2 border-blue-500/20">
                            <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                                <h4 className="text-sm font-semibold">Voice Chat</h4>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="flex-1 p-3 overflow-y-auto" ref={scrollRef}>
                                <div className="space-y-3">
                                    {messages.length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">
                                            Ask me anything about this meeting!
                                        </p>
                                    )}
                                    {messages.map(m => (
                                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-blue-500 text-white' : 'bg-muted'
                                                }`}>
                                                {m.content}
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-muted rounded-lg px-3 py-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-3 border-t bg-background">
                                <div className="flex gap-2">
                                    <Button
                                        variant={isListening ? "destructive" : "secondary"}
                                        size="icon"
                                        className="shrink-0"
                                        onClick={toggleListening}
                                    >
                                        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                    </Button>
                                    <Input
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        placeholder="Type or speak..."
                                        className="text-sm"
                                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                                    />
                                    <Button
                                        size="icon"
                                        className="shrink-0"
                                        disabled={isLoading || !input.trim()}
                                        onClick={handleSend}
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
