'use server'

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function getMediaFile(filePath: string): Promise<{ data: string; mimeType: string }> {
  try {
    const absolutePath = resolve(filePath)
    const buffer = await readFile(absolutePath)
    // convert to base64
    const data = buffer.toString('base64')
    
    const getMimeType = (path: string): string => {
      const ext = path.split('.').pop()?.toLowerCase()
      const isAudio = path.toLowerCase().includes('input') || path.toLowerCase().includes('output')
      
      switch (ext) {
        case 'mp4': return 'video/mp4'
        case 'webm': return 'video/webm'
        case 'ogg': return 'video/ogg'
        case 'mp3': return 'audio/mpeg'
        case 'wav': return 'audio/wav'
        default: return isAudio ? 'audio/mpeg' : 'video/mp4'
      }
    }

    return {
      data,
      mimeType: getMimeType(filePath)
    }
  } catch (error) {
    console.error('failed to read media file:', error)
    throw new Error(`failed to read media file: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}
