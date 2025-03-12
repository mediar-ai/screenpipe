import { NextResponse } from 'next/server'

export async function GET() {
  console.log('test route called')
  return NextResponse.json({ hello: 'world' })
} 