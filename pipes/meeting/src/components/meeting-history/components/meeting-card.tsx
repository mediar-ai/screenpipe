import { Card, CardContent } from "@/components/ui/card"
import { Meeting } from "../types"
import { Button } from "@/components/ui/button"
import { Wand2, FileText, ChevronDown } from "lucide-react"
import { useState } from "react"
import { generateMeetingName } from "../ai-meeting-title"
import { useSettings } from "@/lib/hooks/use-settings"
import { updateMeeting } from "../hooks/storage-meeting-data"
import { useToast } from "@/hooks/use-toast"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { generateMeetingSummary } from "../ai-meeting-summary"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { MeetingPrepDetails } from "./meeting-prep-card"
import { Settings } from "@screenpipe/browser"

interface MeetingCardProps {
  meeting: Meeting
  onUpdate: (id: string, update: { aiName?: string; aiSummary?: string }) => void
  settings: Settings
}

export function MeetingCard({ meeting, onUpdate, settings }: MeetingCardProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const { toast } = useToast()

  const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const formatDuration = (start: string, end: string): string => {
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const durationMs = endTime - startTime
    
    const minutes = Math.floor(durationMs / (1000 * 60))
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`
    }
    return `${minutes}m`
  }

  const handleGenerateName = async () => {
    if (isGenerating) return
    
    setIsGenerating(true)
    try {
      if (!settings) {
        throw new Error("no settings found")
      }
      
      console.log("generating name for meeting:", meeting.id)
      const aiName = await generateMeetingName(meeting, settings)
      
      if (!meeting.id) {
        throw new Error("no meeting id found")
      }
      
      // Update meeting in storage and notify parent
      await updateMeeting(meeting.id, { aiName })
      onUpdate(meeting.id, { aiName })
      
      toast({
        title: "name generated",
        description: "ai name has been generated and saved",
      })
    } catch (error) {
      console.error("failed to generate name:", error)
      toast({
        title: "generation failed",
        description: "failed to generate ai name. please try again",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateSummary = async () => {
    if (isGeneratingSummary) return
    
    setIsGeneratingSummary(true)
    try {
      if (!settings) {
        throw new Error("no settings found")
      }
      
      console.log("generating summary for meeting:", meeting.id)
      const aiSummary = await generateMeetingSummary(meeting, settings)
      
      if (!meeting.id) {
        throw new Error("no meeting id found")
      }
      
      // Update meeting in storage and notify parent
      await updateMeeting(meeting.id, { aiSummary })
      onUpdate(meeting.id, { aiSummary })
      
      toast({
        title: "summary generated",
        description: "ai summary has been generated and saved",
      })
    } catch (error) {
      console.error("failed to generate summary:", error)
      toast({
        title: "generation failed",
        description: "failed to generate ai summary. please try again",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const getDurationMinutes = (start: string, end: string): number => {
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    return Math.floor((endTime - startTime) / (1000 * 60))
  }

  const getDurationScale = (minutes: number): string => {
    // Scale between 0.5 and 1 for meetings between 0 and 60 minutes
    const scale = 0.5 + Math.min(minutes / 60, 1) * 0.5
    return `scale-y-[${scale}]`
  }

  const durationMinutes = getDurationMinutes(meeting.meetingStart, meeting.meetingEnd)
  const scaleClass = getDurationScale(durationMinutes)

  return (
    <Card className="w-full mb-1 border-0 -mx-2">
      <CardContent className="p-3 relative">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted-foreground/10 origin-bottom transition-transform duration-500"
          style={{ 
            transform: `scaleY(${0.5 + Math.min(durationMinutes / 60, 1) * 0.5})`,
            opacity: 0.2
          }} 
        />
        <div className="flex gap-4">
          <div className="flex-none w-[30%]">
            <h3 className="text-base font-bold">
              {(meeting.humanName || meeting.aiName || "untitled meeting").replace(/^"|"$/g, '')}
            </h3>
            <div className="text-sm text-muted-foreground flex items-center justify-between">
              <div className="flex items-center">
                {formatTime(meeting.meetingStart)} • {formatDuration(meeting.meetingStart, meeting.meetingEnd)}
                <div 
                  className="h-3 w-2 bg-muted-foreground/20 origin-left transition-transform duration-500 ml-2"
                  style={{ transform: `scaleX(${0.5 + Math.min(durationMinutes / 60, 1) * 5.0})` }}
                />
              </div>
              <div className="flex">
                <HoverCard openDelay={0} closeDelay={0}>
                  <HoverCardTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      onClick={handleGenerateName}
                      disabled={isGenerating}
                    >
                      <Wand2 className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-auto p-2">
                    <span className="text-sm text-muted-foreground">
                      re-generate an ai name for this meeting
                    </span>
                  </HoverCardContent>
                </HoverCard>
                <HoverCard openDelay={0} closeDelay={0}>
                  <HoverCardTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      onClick={handleGenerateSummary}
                      disabled={isGeneratingSummary}
                    >
                      <FileText className={`h-4 w-4 ${isGeneratingSummary ? "animate-spin" : ""}`} />
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-auto p-2">
                    <span className="text-sm text-muted-foreground">
                      generate an ai summary for this meeting
                    </span>
                  </HoverCardContent>
                </HoverCard>
                {meeting.aiPrep && (
                  <HoverCard openDelay={0} closeDelay={0}>
                    <HoverCardTrigger asChild>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1 flex items-center gap-1 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300"
                          >
                            <span className="text-xs">ai prep</span>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="absolute left-0 right-0 mt-2 z-20 bg-white dark:bg-gray-950 border rounded-md p-4 shadow-lg">
                          <MeetingPrepDetails aiPrep={meeting.aiPrep} />
                        </CollapsibleContent>
                      </Collapsible>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-auto p-2">
                      <span className="text-sm text-muted-foreground">
                        view ai-generated meeting preparation insights
                      </span>
                    </HoverCardContent>
                  </HoverCard>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1">
            {meeting.agenda && (
              <div className="text-sm text-muted-foreground mb-2">
                {meeting.agenda}
              </div>
            )}
            {meeting.aiSummary && (
              <div className="text-sm text-muted-foreground">
                {meeting.aiSummary}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}