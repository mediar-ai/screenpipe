'use client'

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { LiveTranscription } from "@/components/live-transcription/new-meeting-wrapper"
import { MeetingHistory } from "@/components/meeting-history/meeting-history"

export function TabsWrapper() {
  const [showTabs, setShowTabs] = useState(false)

  return (
    <Tabs defaultValue="history" className="h-full flex flex-col">
      <div 
        className="relative h-4 flex justify-center"
        onMouseEnter={() => setShowTabs(true)}
        onMouseLeave={() => setShowTabs(false)}
      >
        <div className={`
          absolute top-0 left-1/2 -translate-x-1/2 z-10 transition-all duration-200 
          ${showTabs ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}
        `}>
          <TabsList className="w-fit p-0.5 bg-gray-100">
            <TabsTrigger 
              value="live" 
              className="data-[state=active]:bg-black data-[state=active]:text-white text-xs px-3"
            >
              live
            </TabsTrigger>
            <TabsTrigger 
              value="history"
              className="data-[state=active]:bg-black data-[state=active]:text-white text-xs px-3"
            >
              history
            </TabsTrigger>
          </TabsList>
        </div>
        {!showTabs && (
          <div className="absolute top-[-0.25rem] left-1/2 -translate-x-1/2 h-1 w-8 bg-gray-500 rounded hover:bg-gray-400 transition-colors" />
        )}
      </div>
      <TabsContent value="live" className="flex-1">
        <LiveTranscription />
      </TabsContent>
      <TabsContent value="history" className="flex-1">
        <MeetingHistory />
      </TabsContent>
    </Tabs>
  )
} 