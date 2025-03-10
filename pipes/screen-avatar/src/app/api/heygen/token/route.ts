import { NextRequest, NextResponse } from 'next/server'

// Test route
export async function GET() {
  console.log('GET /api/heygen/token called')
  return NextResponse.json({ hello: 'world' })
}

// Add OPTIONS handler for CORS preflight
export async function OPTIONS() {
  console.log('OPTIONS /api/heygen/token called')
  return NextResponse.json({}, { status: 200 })
}

export async function POST(req: NextRequest) {
  console.log('POST /api/heygen/token called')
  try {
    // Hardcode API key for testing
    const API_KEY = 'ZmM4MDcyMThmNzk5NDE4YjllNDQwYzg1ZjJmODQ4YWMtMTc0MDI1MDU3Mg=='
    
    const response = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('heygen token error:', response.status, errorText)
      return NextResponse.json({ error: 'failed to get token' }, { status: response.status })
    }

    const data = await response.json()
    console.log('heygen token success:', data)
    return NextResponse.json(data)
  } catch (err) {
    console.error('heygen token error:', err)
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
} 