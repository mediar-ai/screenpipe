"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Trash2, Eye, EyeOff } from "lucide-react"
import { useEffect, useState } from 'react'
import { getMeetings, getAllUpdates } from '../hooks/storage-meeting-data'
import { meetingStore } from '../../live-transcription/hooks/storage-for-live-meeting'

interface MeetingSettingsProps {
  onBack: () => void
}

type TranscriptionMode = 'browser' | 'screenpipe'

export function MeetingSettings({ onBack }: MeetingSettingsProps) {
  const [stats, setStats] = useState<{
    meetingsCount: number
    updatesCount: number
    liveMeetingsCount: number
    meetingsSize: string
    updatesSize: string
    liveMeetingsSize: string
    orphanedUpdates: string[]
  }>()
  const [showRawData, setShowRawData] = useState(false)
  const [rawData, setRawData] = useState<{
    meetings: any[]
    updates: Record<string, any>
    liveMeetings: Record<string, any>
  }>()
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('browser')

  useEffect(() => {
    const loadData = async () => {
      try {
        const meetings = await getMeetings()
        const updates = await getAllUpdates()
        
        // Get all live meetings
        const liveKeys = await meetingStore.keys()
        const liveMeetings: Record<string, any> = {}
        for (const key of liveKeys) {
          liveMeetings[key] = await meetingStore.getItem(key)
        }

        console.log('loaded storage data:', {
          meetingsCount: meetings?.length || 0,
          updatesCount: Object.keys(updates || {}).length,
          liveMeetingsCount: Object.keys(liveMeetings).length
        })

        // Set stats with null checks
        const stats = {
          meetingsCount: meetings?.length || 0,
          updatesCount: Object.keys(updates || {}).length,
          liveMeetingsCount: Object.keys(liveMeetings).length,
          meetingsSize: (new TextEncoder().encode(JSON.stringify(meetings || [])).length / 1024).toFixed(2) + 'kb',
          updatesSize: (new TextEncoder().encode(JSON.stringify(updates || {})).length / 1024).toFixed(2) + 'kb',
          liveMeetingsSize: (new TextEncoder().encode(JSON.stringify(liveMeetings)).length / 1024).toFixed(2) + 'kb',
          orphanedUpdates: Object.keys(updates || {}).filter(id => !meetings?.some(m => m.id === id))
        }
        setStats(stats)

        // Set raw data
        setRawData({
          meetings: meetings || [],
          updates: updates || {},
          liveMeetings
        })
      } catch (error) {
        console.error('failed to load storage data:', error)
      }
    }
    loadData()
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

      {/* transcription mode selector */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold">transcription mode</h2>
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            className={`flex-1 px-4 py-2 rounded-md transition-colors ${
              transcriptionMode === 'screenpipe' 
                ? 'bg-background shadow-sm' 
                : 'hover:bg-background/50'
            }`}
            onClick={() => {
              console.log('changing transcription mode to: screenpipe')
              setTranscriptionMode('screenpipe')
            }}
          >
            screenpipe
          </button>
          <button
            className={`flex-1 px-4 py-2 rounded-md transition-colors ${
              transcriptionMode === 'browser' 
                ? 'bg-background shadow-sm' 
                : 'hover:bg-background/50'
            }`}
            onClick={() => {
              console.log('changing transcription mode to: browser')
              setTranscriptionMode('browser')
            }}
          >
            browser
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {transcriptionMode === 'screenpipe' 
            ? 'uses screenpipe to power your meeting notes'
            : 'use browser-based transcription, no extra local context available'}
        </p>
      </div>

      {/* storage stats section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">storage stats</h2>
        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div>meetings count</div>
          <div>{stats?.meetingsCount || 0}</div>
          
          <div>updates count</div>
          <div>{stats?.updatesCount || 0}</div>
          
          <div>live meetings count</div>
          <div>{stats?.liveMeetingsCount || 0}</div>
          
          <div>meetings size</div>
          <div>{stats?.meetingsSize || '0kb'}</div>
          
          <div>updates size</div>
          <div>{stats?.updatesSize || '0kb'}</div>

          <div>live meetings size</div>
          <div>{stats?.liveMeetingsSize || '0kb'}</div>
          
          <div>orphaned updates</div>
          <div>{stats?.orphanedUpdates?.length || 0}</div>
        </div>
      </div>

      {/* Raw Data Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">raw storage data</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRawData(!showRawData)}
          >
            {showRawData ? (
              <><EyeOff className="h-4 w-4 mr-2" /> hide</>
            ) : (
              <><Eye className="h-4 w-4 mr-2" /> show</>
            )}
          </Button>
        </div>

        {showRawData && rawData && (
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-2">live meetings ({Object.keys(rawData.liveMeetings).length})</h3>
              <pre className="text-xs overflow-auto max-h-40 bg-gray-50 p-2 rounded">
                {JSON.stringify(rawData.liveMeetings, null, 2)}
              </pre>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-medium mb-2">stored meetings ({rawData.meetings.length})</h3>
              <pre className="text-xs overflow-auto max-h-40 bg-gray-50 p-2 rounded">
                {JSON.stringify(rawData.meetings, null, 2)}
              </pre>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-medium mb-2">updates ({Object.keys(rawData.updates).length})</h3>
              <pre className="text-xs overflow-auto max-h-40 bg-gray-50 p-2 rounded">
                {JSON.stringify(rawData.updates, null, 2)}
              </pre>
            </Card>
          </div>
        )}
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
  )
} 