"use client"

import { AvatarVideoTransparent } from './avatar-video-transparent'

export function AvatarVideo({ mediaStream }: { mediaStream: MediaStream | null }) {
  if (!mediaStream) return null
  
  return <AvatarVideoTransparent mediaStream={mediaStream} />
}

/* previous simple verison:
  return (
    <div className="relative w-full aspect-video bg-black rounded-lg mb-4">
      <video
        autoPlay
        playsInline
        ref={(video) => {
          if (video && mediaStream) {
            console.log('setting video stream')
            video.srcObject = mediaStream
            video.play().catch(err => console.error('video play error:', err))
          }
        }}
        className="w-full h-full"
      />
    </div>
  )
*/