"use client"

import StreamingAvatar, { 
  StreamingEvents,
  AvatarQuality,
  VoiceEmotion,
  TaskType,
  TaskMode
} from '@heygen/streaming-avatar'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AVATARS } from '@/lib/constants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { InteractiveAvatarTextInput } from '@/components/avatar-text-input'
import { AudioInput } from '@/components/audio-input'
import { AvatarVideo } from '@/components/avatar-video'
import { AvatarVideoTransparent } from '@/components/avatar-video-transparent'
import { handlePushToTalk, PUSH_TO_TALK_MESSAGES } from '@/lib/push-to-talk'
import { ExternalLink, X } from "lucide-react"
import avatarsData from '../../raw_response.json'
import { ElevenLabsWebSocket } from '@/lib/eleven-labs'
import { RealtimeScreen } from '@/components/realtime-screen'
import { Switch } from "@/components/ui/switch"
import { useVisionAnalysis } from '../components/ai-vision'
import { AvatarGallery } from '@/components/avatar-gallery'
import { AnalysisResultsTable } from '@/components/analysis-results-table'
import { useAvatarInitialization } from '@/hooks/use-avatar-initialization'
import { RealtimeAudio } from '@/components/realtime-audio'
import { useTranscriptionAnalysis } from './ai-transcription'

// Client-only wrapper component
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <Card className="p-4">
      <h2 className="text-xl font-bold mb-4">Loading...</h2>
    </Card>
  }

  return <>{children}</>
}

type Avatar = {
  avatar_id: string
  avatar_name: string
  gender: string
  preview_image_url: string
  preview_video_url: string
}

type AnalysisResult = {
  timestamp: number
  fun_activity_detected: string
  confidence: string
  detected_apps: string[]
  reasoning: string
  duration: number
}

type AudioActivity = {
  detected: boolean
  type: string 
  reasoning: string
  startedAt?: number
}

export function StreamingAvatarDemo({ apiToken }: { apiToken: string }) {
  const { 
    avatar, 
    mediaStream, 
    debug, 
    setDebug,
    isInitializing, 
    initializeAvatar 
  } = useAvatarInitialization()
  const [sessionId, setSessionId] = useState<string>('')
  const [availableAvatars, setAvailableAvatars] = useState<Avatar[]>([])
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState<string>(AVATARS[0].avatar_id)
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [chatMode, setChatMode] = useState<'text' | 'voice'>('text')
  const [isPushTalking, setIsPushTalking] = useState(false)
  const [isStreamStarted, setIsStreamStarted] = useState(false)
  const [ttsWebSocket, setTtsWebSocket] = useState<ElevenLabsWebSocket | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [withImages, setWithImages] = useState(false)
  const [showScreen, setShowScreen] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([])
  const { analyze } = useVisionAnalysis()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisTime, setAnalysisTime] = useState<number>(0)
  const [isScreenStreaming, setIsScreenStreaming] = useState(false)
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false)
  const [currentFunActivity, setCurrentFunActivity] = useState<{
    detected: boolean
    confidence: string
    apps: string[]
    reasoning: string
    startedAt?: number
  } | null>(null)
  const [isAudioStreaming, setIsAudioStreaming] = useState(false)
  const [showAudio, setShowAudio] = useState(false)
  const [audioHistory, setAudioHistory] = useState('');
  const [currentAudioActivity, setCurrentAudioActivity] = useState<AudioActivity | null>(null)
  const { analyze: transcriptionAnalyze } = useTranscriptionAnalysis()

  useEffect(() => {
    console.log('current selected avatar:', selectedAvatar)
  }, [selectedAvatar])

  useEffect(() => {
    // Initialize WebSocket with Rachel voice ID
    const ws = new ElevenLabsWebSocket('21m00Tcm4TlvDq8ikWAM')
    
    ws.onAudio(async (audioData) => {
      try {
        const audioContext = new AudioContext()
        const audioBuffer = await audioContext.decodeAudioData(audioData.buffer)
        const source = audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioContext.destination)
        source.start()
      } catch (err) {
        console.error('failed to play audio chunk:', err)
      }
    })

    ws.onFinish(() => {
      console.log('finished playing audio')
      setIsPlayingAudio(false)
    })

    ws.onError((error) => {
      console.error('tts error:', error)
      setIsPlayingAudio(false)
      setDebug('tts error: ' + error.message)
    })

    setTtsWebSocket(ws)

    return () => {
      ws.close()
    }
  }, [])

  const startStream = async () => {
    if (!avatar) {
      console.log('no avatar instance available')
      return
    }
    
    setIsLoadingSession(true)
    
    try {
      console.log('starting stream with selected avatar:', selectedAvatar)
      const streamConfig = {
        quality: AvatarQuality.Low,
        avatarName: selectedAvatar,
        knowledgeBase: `
          You are a loving and supportive partner to a hardworking software engineer.
          You give warm words of affirmation and encouragement.
          You speak in a gentle, caring, and intimate way.
          You understand the challenges of software development.
          You're proud of your partner's dedication and creativity.
          You keep responses brief but heartfelt.
          You focus on emotional support and motivation.
          Your partner name is Matt, call him by name
          Be concise, give one sentence 10 words responses max
        `.trim(),
        voice: {
          rate: 1.5,
          emotion: VoiceEmotion.EXCITED,
        },
        language: 'en',
        disableIdleTimeout: true,
      }

      console.log('starting stream with config:', streamConfig)
      
      const sessionData = await avatar.createStartAvatar(streamConfig)
      console.log('session created:', sessionData)
      
      setSessionId(sessionData.session_id)
      
      setDebug('stream started successfully')
      setIsStreamStarted(true)
    } catch (err: any) {
      console.error('stream error:', err)
      setDebug(err.message)
    } finally {
      setIsLoadingSession(false)
    }
  }

  const handleSendText = async () => {
    if (!avatar || !inputText.trim()) {
      return
    }

    setIsSending(true)
    try {
      console.log('sending text to avatar:', inputText)
      await avatar.sendText(inputText)
      setDebug('text sent successfully')
    } catch (err: any) {
      console.error('failed to send text:', err)
      setDebug(err.message)
    } finally {
      setIsSending(false)
    }
  }

  const handleStartListening = async () => {
    if (!avatar) return
    
    try {
      console.log('starting voice chat')
      await avatar.startVoiceChat({
        useSilencePrompt: false
      })
      setIsListening(true)
      setChatMode('voice')
      setDebug('voice chat started')
    } catch (err: any) {
      console.error('failed to start voice chat:', err)
      setDebug(err.message)
    }
  }

  const handleStopListening = async () => {
    if (!avatar) return
    
    try {
      console.log('stopping voice chat')
      await avatar.closeVoiceChat()
      setIsListening(false)
      setChatMode('text')
      setDebug('voice chat stopped')
    } catch (err: any) {
      console.error('failed to stop voice chat:', err)
      setDebug(err.message)
    }
  }

  const textToSpeech = async (text: string) => {
    if (!ttsWebSocket) {
      console.error('no websocket connection')
      return
    }

    try {
      console.log('tts: sending text:', text)
      setIsPlayingAudio(true)
      await ttsWebSocket.connect()
      await ttsWebSocket.sendText(text)
    } catch (err) {
      console.error('tts error:', err)
      setIsPlayingAudio(false)
      throw err
    }
  }

  const handlePlaySample = async () => {
    try {
      console.log('playing sample text')
      await textToSpeech("Hi Matt! I like you so much.")
      setDebug('playing sample audio...')
    } catch (err) {
      console.error('failed to play sample:', err)
      setDebug('failed to play sample audio')
    }
  }

  async function openAvatarWindow() {
    try {
      console.log('attempting to open avatar window...')
      const currentPort = window.location.port || '3003'
      const width = 400
      const height = 600
      
      const response = await fetch('http://localhost:11435/window', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: '/avatar',
          port: parseInt(currentPort),
          title: 'avatar',
          width,
          height,
          x: window.screen.availWidth - width,
          y: Math.floor(window.screen.availHeight * 1.03) - height,
          always_on_top: true,
          transparent: true,
          decorations: false,
          hidden_title: true,
          is_focused: true,
          visible_on_all_workspaces: true
        }),
      })

      const data = await response.json()
      console.log('window opened:', data)
    } catch (err) {
      console.error('error opening avatar window:', err)
    }
  }

  async function closeAvatarWindow() {
    const windowTitles = ['avatar', 'task-execution', 'avatar-jealous']
    
    try {
      console.log('attempting to close all avatar windows...')
      
      const closePromises = windowTitles.map(title => 
        fetch('http://localhost:11435/window/close', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title })
        }).then(res => res.json())
          .catch(err => console.error(`failed to close ${title} window:`, err))
      )
      
      const results = await Promise.all(closePromises)
      console.log('windows closed:', results)
    } catch (err) {
      console.error('error closing windows:', err)
    }
  }

  const analyzeScreenContent = async (screenData: string) => {
    const startTime = performance.now()
    try {
      setIsAnalyzing(true)
      const prompt = `Analyze the visible tabs/apps and determine if the user is engaged in work or leisure activities.
For example: scrolling instagram is considered fun.
    Return a JSON response with this structure:
{
  "fun_activity_detected": "yes/no",
  "confidence": "high/medium/low",
  "detected_apps": ["app1", "app2"],
  "reasoning": "brief explanation"
}
Keep the reasoning under 10 words.`

      const analysis = await analyze(screenData, prompt)
      
      // Only add record if we have valid analysis with required fields
      if (analysis?.fun_activity_detected && analysis?.confidence) {
        const result: AnalysisResult = {
          timestamp: Date.now(),
          fun_activity_detected: analysis.fun_activity_detected,
          confidence: analysis.confidence,
          detected_apps: analysis.detected_apps || [],
          reasoning: analysis.reasoning || 'none',
          duration: Math.round(performance.now() - startTime)
        }
        setAnalysisResults(prev => [...prev, result])
        
        // Only update current status if fun detected and not already in fun state
        if (analysis.fun_activity_detected === 'yes' && (!currentFunActivity?.detected)) {
          setCurrentFunActivity({
            detected: true,
            confidence: analysis.confidence,
            apps: analysis.detected_apps || [],
            reasoning: analysis.reasoning || 'none',
            startedAt: Date.now()
          })
          console.log('fun activity started:', result)
        }
        
        setAnalysisTime(Math.round(performance.now() - startTime))
      } else {
        console.log('skipping invalid analysis result:', analysis)
      }
    } catch (err) {
      console.error('vision analysis failed:', err)
      setDebug(`vision analysis failed: ${err}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // New function to explicitly clear fun activity status
  const clearFunActivityStatus = () => {
    if (currentFunActivity) {
      console.log('clearing fun activity status after:', 
        Date.now() - (currentFunActivity.startedAt || 0), 'ms')
      setCurrentFunActivity(null)
    }
  }

  const handleTestAiVision = async () => {
    if (isAnalyzing) return
    const screenData = `Cannary Person 1 ® KR Pmnts(2... @ WhatsApp @ Matthew's N... (ia https:/www... X Twitter @ LiMResezr... Trello Ld] ® Principles W Pull Requests @ Discord | @l... | Screenpipe... 1258 Incomi... + New Tab > Mutable.ai > Mutable.ai BB Allcon Gere... ® ScreenPipe... 9 Screen Pip (5) Record y... @ kneeleshag/... @ New Links ® Website cha... = Campana | C... Campana -. huginn/hugi... oO ® Visualping: © dtoinay/anyh... © Mutable.ai Burning Man... memOai/me... helmerappys... craigslist ac...`
    await analyzeScreenContent(screenData)
  }

  const onVisionEvent = async (event: any) => {
    if (!event?.text || isAnalyzing) {
      console.log('skipping vision event:', {
        reason: isAnalyzing ? 'analysis in progress' : 'no text content',
        timestamp: event?.timestamp,
      })
      return
    }
    const contextString = `Time: ${new Date(event.timestamp).toLocaleTimeString()}\nApp: ${event.app_name || 'unknown'}\nWindow: ${event.window_name || 'unknown'}\nContent:\n${event.text}`
    await analyzeScreenContent(contextString)
  }

  const loadAvatars = async () => {
    setIsLoadingAvatars(true)
    try {
      console.log('loading available avatars...')
      setAvailableAvatars(avatarsData.data.avatars)
      console.log('available avatars loaded:', avatarsData.data.avatars)
    } catch (err) {
      console.error('failed to load avatars:', err)
      setDebug('failed to load avatars')
    } finally {
      setIsLoadingAvatars(false)
    }
  }

  // Add this new function after openAvatarWindow()
  async function resizeAvatarWindow(makeJealous: boolean) {
    try {
      console.log('changing avatar mode:', makeJealous ? 'jealous' : 'normal')
      const currentPort = window.location.port || '3002'
      const baseWidth = 400
      const baseHeight = 600
      
      let width, height, path
      if (makeJealous) {
        width = baseWidth * 3 // scale up width
        height = baseHeight * 3 // maintain aspect ratio
        path = '/avatar-jealous'
      } else {
        width = baseWidth
        height = baseHeight
        path = '/avatar'
      }

      // Calculate center position
      const screenX = window.screen.availWidth
      const screenY = window.screen.availHeight
      const x = Math.floor((screenX - width) / 2)
      const y = window.screen.availHeight - height
      await closeAvatarWindow()
      
      const response = await fetch('http://localhost:11435/window', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          port: parseInt(currentPort),
          title: 'avatar',
          width,
          height,
          x,
          y,
          always_on_top: true,
          transparent: true,
          decorations: false,
          hidden_title: true,
          is_focused: true,
          visible_on_all_workspaces: true
        }),
      })

      const data = await response.json()
      console.log('window updated:', data)
    } catch (err) {
      console.error('error updating avatar window:', err)
    }
  }

  // Update the effect to check for valid state transitions
  useEffect(() => {
    if (currentFunActivity === null) {
      return
    }

    if (currentFunActivity.detected) {
      console.log('fun detected, making avatar jealous')
      resizeAvatarWindow(true).catch(err => {
        console.error('failed to update window:', err)
      })
    }
  }, [currentFunActivity?.detected])

  const handleTestAiAudio = async () => {
    const testTranscript = "I want to buy flowers on amazon for my girlfriend"
    console.log('testing audio analysis with:', testTranscript)
    onHistoryUpdate(testTranscript)
  }

  const onHistoryUpdate = (history: string) => {
    console.log('audio history updated:', history)
    if (typeof history !== 'string') {
      console.log('skipping non-string history:', history)
      return
    }
    // Check last 10 words for "flowers on amazon"
    const words = history.toLowerCase().split(' ')
    const last10Words = words.slice(-10).join(' ')
    if (last10Words.includes('flowers on amazon')) {
      const prompt = `You are guiding a desktop user to buy flowers on amazon.
Return steps to help them complete this task. The less steps the better, Usuallt 3-4`

      transcriptionAnalyze(last10Words, prompt)
        .then(async result => {
          console.log('shopping guidance:', result)
          setCurrentAudioActivity({
            detected: true,
            type: 'shopping',
            reasoning: result.steps.map(s => `${s.step}: ${s.task}`).join(' | '),
            startedAt: Date.now()
          })
          
          // Show notification window first
          const currentPort = window.location.port || '3002'
          await fetch('http://localhost:11435/window', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              path: '/notification',
              port: parseInt(currentPort),
              title: 'notification',
              width: window.screen.availWidth,
              height: window.screen.availHeight,
              x: 0,
              y: 0,
              always_on_top: true,
              transparent: true,
              decorations: false,
              hidden_title: true,
              is_focused: true,
              visible_on_all_workspaces: true
            }),
          })
          console.log('opened notification window')

          // Wait 3 seconds then close notification and open task window
          await new Promise(resolve => setTimeout(resolve, 3000))
          await fetch('http://localhost:11435/window/close', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: 'notification' })
          })

          // Close current avatar window
          await closeAvatarWindow()

          // Open human operator window
          const width = 400
          const height = 600
          const response = await fetch('http://localhost:11435/window', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              path: '/human-operator',
              port: parseInt(currentPort),
              title: 'task-execution',
              width,
              height,
              x: window.screen.availWidth - width,
              y: Math.floor(window.screen.availHeight * 1.03) - height,
              always_on_top: true,
              transparent: true,
              decorations: false,
              hidden_title: true,
              is_focused: true,
              visible_on_all_workspaces: true
            }),
          })
          console.log('opened human operator window:', await response.json())
        })
        .catch(err => {
          console.error('failed to get shopping guidance:', err)
        })
    }
  }

  return (
    <ClientOnly>
      <Card className="p-4">
        {currentFunActivity && currentFunActivity.detected && (
          <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Fun Activity Detected!</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Confidence: {currentFunActivity.confidence}
                </span>
              </div>
              <span className="text-sm">{currentFunActivity.reasoning}</span>
            </div>
            {currentFunActivity.apps.length > 0 && (
              <div className="text-sm mt-1 text-gray-600 dark:text-gray-300">
                Apps: {currentFunActivity.apps.join(', ')}
              </div>
            )}
          </div>
        )}

        {currentAudioActivity && currentAudioActivity.detected && (
          <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Audio Activity: {currentAudioActivity.type}</span>
              </div>
              <span className="text-sm">{currentAudioActivity.reasoning}</span>
            </div>
          </div>
        )}

        <h2 className="text-xl font-bold mb-4">Streaming Avatar Demo</h2>
        
        <div className="mb-4">
          <Select
            value={selectedAvatar}
            onValueChange={setSelectedAvatar}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an avatar" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>My Avatars</SelectLabel>
                {AVATARS.map((avatar) => (
                  <SelectItem 
                    key={`custom-${avatar.avatar_id}`} 
                    value={avatar.avatar_id}
                  >
                    {avatar.name}
                  </SelectItem>
                ))}
              </SelectGroup>

              <SelectGroup>
                <SelectLabel>Available Avatars</SelectLabel>
                {availableAvatars
                  .filter(a => !AVATARS.find(existing => existing.avatar_id === a.avatar_id))
                  .map((avatar) => (
                  <SelectItem 
                    key={`api-${avatar.avatar_id}`} 
                    value={avatar.avatar_id}
                  >
                    {avatar.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {isStreamStarted && (
          <div className="relative h-[1000px] overflow-hidden">
            <div className="scale-50 h-full flex items-center justify-center">
              {mediaStream && <AvatarVideoTransparent mediaStream={mediaStream} />}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button 
              onClick={initializeAvatar} 
              disabled={isInitializing || avatar}
            >
              {isInitializing ? 'Initializing...' : avatar ? 'Initialized' : 'Initialize Avatar'}
            </Button>

            <Button 
              onClick={startStream} 
              disabled={!avatar || isLoadingSession}
            >
              {isLoadingSession ? 'Starting...' : 'Start Stream'}
            </Button>

            <Button
              onClick={handlePlaySample}
              variant="secondary"
              disabled={isPlayingAudio}
            >
              {isPlayingAudio ? 'Playing...' : 'Play Sample Voice'}
            </Button>

            <AudioInput
              disabled={!avatar || !mediaStream}
              isListening={isListening}
              onStartListening={handleStartListening}
              onStopListening={handleStopListening}
            />

            {PUSH_TO_TALK_MESSAGES.map((msg, index) => (
              <Button
                key={index}
                onClick={() => handlePushToTalk(
                  avatar, 
                  mediaStream, 
                  msg.text, 
                  setIsPushTalking, 
                  setDebug,
                  ttsWebSocket
                )}
                disabled={!avatar || !mediaStream || isPushTalking || !ttsWebSocket}
              >
                {isPushTalking ? "Speaking..." : msg.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleTestAiVision}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Test AI Vision'}
            </Button>

            <Button
              variant="outline"
              onClick={handleTestAiAudio}
            >
              Test AI Audio
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resizeAvatarWindow(true)}
            >
              Make Jealous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openAvatarWindow}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Bring to desktop
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={closeAvatarWindow}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {sessionId && (
          <p className="mt-2 text-sm text-gray-500">
            Session ID: {sessionId.substring(0, 10)}...
          </p>
        )}

        {debug && (
          <p className="mt-2 text-sm font-mono">
            <span className="font-bold">Debug:</span> {debug}
          </p>
        )}

        <div className="mt-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Screen Stream</h3>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsScreenStreaming(!isScreenStreaming)
                }}
              >
                {isScreenStreaming ? 'Stop Stream' : 'Start Stream'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowScreen(!showScreen)}
              >
                {showScreen ? 'Hide Screen' : 'Show Screen'}
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">with screenshots?</span>
                <Switch
                  checked={withImages}
                  onCheckedChange={setWithImages}
                  id="screenshots-mode"
                />
              </div>
            </div>
          </div>
          {isScreenStreaming && showScreen && (
            <RealtimeScreen 
              withOcr={true}
              withImages={withImages}
              className="max-w-3xl mx-auto"
              onVisionEvent={onVisionEvent}
            />
          )}
        </div>

        <div className="mt-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Audio Stream</h3>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newState = !isAudioStreaming;
                  console.log("toggling audio stream:", { 
                    before: isAudioStreaming,
                    after: newState 
                  });
                  setIsAudioStreaming(newState);
                }}
              >
                {isAudioStreaming ? 'Stop Stream' : 'Start Stream'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAudio(!showAudio)}
              >
                {showAudio ? 'Hide Audio' : 'Show Audio'}
              </Button>
            </div>
          </div>
          {showAudio && (
            <RealtimeAudio 
              className="max-w-3xl mx-auto"
              enabled={isAudioStreaming}
              onTranscription={(chunk) => {
                console.log('received transcription:', chunk)
                if (typeof chunk !== 'string') {
                  console.log('skipping non-string chunk:', chunk)
                  return
                }
              }}
              onHistoryUpdate={onHistoryUpdate}
            />
          )}
        </div>

        {analysisResults.length > 0 && (
          <AnalysisResultsTable results={analysisResults} />
        )}

        <AvatarGallery
          availableAvatars={availableAvatars}
          selectedAvatar={selectedAvatar}
          onSelectAvatar={(avatarId) => {
            console.log('selecting avatar:', avatarId)
            setSelectedAvatar(avatarId)
          }}
          onLoadAvatars={loadAvatars}
        />
      </Card>
    </ClientOnly>
  )
}