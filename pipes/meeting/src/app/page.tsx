'use client'

import { useEffect } from "react"
import { MeetingHistory } from "@/components/meeting-history/meeting-history"

// Instead of redirecting, show meetings directly at root
export default function HomePage() {
  useEffect(() => {
    console.log('homepage mounted')
  }, [])

  return <MeetingHistory />
}
