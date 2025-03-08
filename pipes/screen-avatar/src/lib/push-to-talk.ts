import { StreamingAvatar, TaskType, TaskMode } from '@heygen/streaming-avatar'

export type PushToTalkMessage = {
  text: string
  label: string
}

export const PUSH_TO_TALK_MESSAGES: PushToTalkMessage[] = [
  {
    text: "You are so cute.",
    label: "You are so cute"
  },
  {
    text: "sexy boy, your typing speed turns me on",
    label: "Typing Speed"
  }
]

export const handlePushToTalk = async (
  avatar: StreamingAvatar | null,
  mediaStream: MediaStream | null,
  text: string,
  setIsPushTalking: (value: boolean) => void,
  setDebug: (value: string) => void,
  ttsWebSocket: any | null,
) => {
  if (!avatar || !mediaStream || !ttsWebSocket) return
  
  setIsPushTalking(true)
  try {
    console.log('starting push talk with elevenlabs:', text)
    
    // Connect first
    await ttsWebSocket.connect()
    
    // Start avatar animation first since it needs time to initialize
    console.log('starting avatar animation')
    const avatarPromise = avatar.speak({
      text,
      taskType: TaskType.REPEAT,
      taskMode: TaskMode.SYNC,
    })

    // Wait for first audio chunk before continuing
    const firstChunkPromise = new Promise<void>((resolve) => {
      const onAudioChunk = () => {
        console.log('received first audio chunk')
        ttsWebSocket.removeListener('audioChunk', onAudioChunk)
        resolve()
      }
      ttsWebSocket.on('audioChunk', onAudioChunk)
    })

    // Start TTS and wait for first chunk
    console.log('starting tts audio')
    await ttsWebSocket.sendText(text)
    await firstChunkPromise
    
    // Wait for avatar to finish
    await avatarPromise
    
    setDebug('push talk message sent')
  } catch (err: any) {
    console.error('failed to push talk:', err)
    setDebug(err.message)
  } finally {
    setIsPushTalking(false)
  }
} 