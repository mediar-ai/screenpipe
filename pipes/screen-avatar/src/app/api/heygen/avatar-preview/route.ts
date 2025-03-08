import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const avatarId = searchParams.get('id')
  
  if (!avatarId) {
    return NextResponse.json({ error: 'missing avatar id' }, { status: 400 })
  }

  try {
    console.log('fetching avatar details for:', avatarId)
    
    // First get the signed URL from HeyGen API
    const heygenResponse = await fetch(`https://api.heygen.com/v2/avatars/${avatarId}`, {
      headers: {
        'x-api-key': process.env.HEYGEN_API_KEY || '',
        'Accept': 'application/json',
      },
    })

    if (!heygenResponse.ok) {
      console.error('heygen api failed:', heygenResponse.status, await heygenResponse.text())
      throw new Error(`failed to fetch avatar details: ${heygenResponse.status}`)
    }

    const data = await heygenResponse.json()
    const previewUrl = data.preview_image_url || data.preview_video_url

    if (!previewUrl) {
      throw new Error('no preview url found')
    }

    // Now fetch the actual image using the signed URL
    const imageResponse = await fetch(previewUrl)
    
    if (!imageResponse.ok) {
      throw new Error(`failed to fetch image: ${imageResponse.status}`)
    }

    const imageData = await imageResponse.arrayBuffer()
    
    return new NextResponse(imageData, {
      headers: {
        'Content-Type': imageResponse.headers.get('Content-Type') || 'image/webp',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('preview fetch error:', err)
    return NextResponse.json({ 
      error: 'failed to fetch preview',
      details: err instanceof Error ? err.message : 'unknown error',
    }, { status: 500 })
  }
}