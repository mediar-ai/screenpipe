"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useEffect, useState } from 'react'
import { getMeetings } from '../hooks/use-meeting-storage'

interface MeetingSettingsProps {
  onBack: () => void
}

export function MeetingSettings({ onBack }: MeetingSettingsProps) {
  const [stats, setStats] = useState<{
    meetingsCount: number
    updatesCount: number
    meetingsSize: string
    updatesSize: string
    orphanedUpdates: string[]
  }>()

  useEffect(() => {
    const loadStats = async () => {
      const meetings = await getMeetings()
      const stats = {
        meetingsCount: meetings.length,
        updatesCount: meetings.length,
        meetingsSize: (new TextEncoder().encode(JSON.stringify(meetings)).length / 1024).toFixed(2) + 'kb',
        updatesSize: '0.00kb',
        orphanedUpdates: []
      }
      setStats(stats)
    }
    loadStats()
  }, [])

  return (
    <div className="h-full w-full overflow-auto p-6">
      {/* header with title and back button */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">settings</h1>
        <Button
          variant="outline"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          back
        </Button>
      </div>

      {/* scrollable content */}
      <div className="space-y-6">
        {/* storage stats section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">storage stats</h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>meetings count</div>
            <div>{stats?.meetingsCount || 0}</div>
            
            <div>updates count</div>
            <div>{stats?.updatesCount || 0}</div>
            
            <div>meetings size</div>
            <div>{stats?.meetingsSize || '0kb'}</div>
            
            <div>updates size</div>
            <div>{stats?.updatesSize || '0kb'}</div>
            
            <div>orphaned updates</div>
            <div>{stats?.orphanedUpdates?.length || 0}</div>
          </div>
        </div>

        {/* ai prompts section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">ai prompts</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">title generation prompt</label>
              <Input 
                className="border-2" 
                placeholder="generate a concise title for this meeting..." 
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">summary generation prompt</label>
              <Input 
                className="border-2" 
                placeholder="summarize the key points of this meeting..." 
              />
            </div>
          </div>
        </div>

        {/* meeting detection section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">meeting detection</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">silence threshold (minutes)</label>
              <Input 
                type="number" 
                className="border-2" 
                placeholder="5" 
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">minimum symbols to keep meeting</label>
              <Input 
                type="number" 
                className="border-2" 
                placeholder="100" 
              />
            </div>
          </div>
        </div>

        {/* danger zone section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-destructive">danger zone</h2>
          <Button variant="destructive" className="w-full">
            <Trash2 className="h-4 w-4 mr-2" />
            erase all meetings data
          </Button>
        </div>
      </div>
    </div>
  )
} 