'use client'

import { useEffect } from 'react'

export function BackendTest() {
  useEffect(() => {
    async function testBackendConnection() {
      try {
        console.log('testing backend connection on startup...')
        const response = await fetch('http://localhost:3030/api/transcription/status')
        console.log('backend test response status:', response.status)
        const data = await response.json()
        console.log('backend test response:', data)
      } catch (error) {
        console.error('backend test failed:', error)
      }
    }
    
    testBackendConnection()
  }, [])

  return null
} 