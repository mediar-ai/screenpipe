"use client"

import { useEffect, useRef } from 'react'

export function AvatarVideoTransparent({ mediaStream }: { mediaStream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!mediaStream || !video || !canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const setupVideo = async () => {
      try {
        console.log('setting up video with stream tracks:', {
          video: mediaStream.getVideoTracks().length,
          audio: mediaStream.getAudioTracks().length
        })
        
        video.srcObject = mediaStream
        mediaStream.getAudioTracks().forEach(track => {
          track.enabled = true
        })
        
        try {
          await video.play()
          console.log('video started playing:', {
            width: video.videoWidth,
            height: video.videoHeight
          })
        } catch (playError) {
          // Ignore AbortError during development
          if (playError.name !== 'AbortError') {
            console.error('video play error:', playError)
          }
        }
        
        // Set canvas size to match window size
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight

        const processFrame = () => {
          if (!video.paused && !video.ended) {
            // Draw video scaled to fill canvas while maintaining aspect ratio
            const scale = Math.max(
              canvas.width / video.videoWidth,
              canvas.height / video.videoHeight
            )
            const x = (canvas.width - video.videoWidth * scale) / 2
            const y = (canvas.height - video.videoHeight * scale) / 2
            
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(
              video, 
              x, y, 
              video.videoWidth * scale,
              video.videoHeight * scale
            )
            
            // Get image data for processing
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const data = imageData.data

            // Process each pixel
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i]
              const g = data[i + 1]
              const b = data[i + 2]

              // Check if pixel is greenish
              if (g > 100 && g > r * 1.4 && g > b * 1.4) {
                data[i + 3] = 0 // Set alpha to 0 (transparent)
              }
            }

            // Put processed image data back
            ctx.putImageData(imageData, 0, 0)
            requestAnimationFrame(processFrame)
          }
        }
        processFrame()
      } catch (err) {
        // Log more details about the error
        console.error('video setup error:', {
          error: err,
          videoState: {
            readyState: video.readyState,
            paused: video.paused,
            ended: video.ended,
            error: video.error
          },
          streamState: {
            active: mediaStream.active,
            id: mediaStream.id
          }
        })
      }
    }

    setupVideo()

    return () => {
      video.srcObject = null
    }
  }, [mediaStream])

  return (
    <div className="fixed inset-0 w-screen h-screen bg-transparent">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="hidden"
      />
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover bg-transparent"
        style={{ backgroundColor: 'transparent' }}
      />
    </div>
  )
} 