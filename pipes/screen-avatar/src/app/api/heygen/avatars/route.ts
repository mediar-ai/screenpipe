import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const response = await fetch('https://api.heygen.com/v1/streaming/avatar.list', {
      headers: {
        'x-api-key': process.env.HEYGEN_API_KEY!,
        'accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Avatar fetch failed: ${response.status}`)
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error) {
    console.error('failed to fetch avatars:', error)
    return NextResponse.json(
      { error: 'Failed to fetch avatars' },
      { status: 500 }
    )
  }
}