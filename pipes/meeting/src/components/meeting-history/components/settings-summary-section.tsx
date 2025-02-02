import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, FileText, PlusCircle } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { Meeting } from "../types"

interface SummarySectionProps {
  meeting: Meeting
  onCopy: (content: string) => void
  onGenerateSummary: (meeting: Meeting, prompt: string) => Promise<void>
  isSummarizing: boolean
}

export function SummarySection({ 
  meeting, 
  onCopy, 
  onGenerateSummary,
  isSummarizing 
}: SummarySectionProps) {
  const [customPrompt, setCustomPrompt] = useState("please provide a concise summary of the following meeting transcript")

  return (
    <div className="relative">
      <h4 className="font-semibold mb-2">summary:</h4>
      {meeting.aiSummary && (
        <Button
          onClick={() => onCopy(meeting.aiSummary || "")}
          className="absolute top-0 right-0 p-1 h-6 w-6"
          variant="outline"
          size="icon"
        >
          <Copy className="h-4 w-4" />
        </Button>
      )}
      {meeting.aiSummary ? (
        <ReactMarkdown className="prose max-w-none">
          {meeting.aiSummary}
        </ReactMarkdown>
      ) : (
        <div className="flex items-center mt-2">
          <Input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="custom summary prompt (optional)"
            className="mr-2 p-2 border rounded text-sm flex-grow"
          />
          <Button
            onClick={() => onGenerateSummary(meeting, customPrompt)}
            disabled={isSummarizing}
          >
            {isSummarizing ? (
              <FileText className="h-4 w-4 mr-2 animate-pulse" />
            ) : (
              <PlusCircle className="h-4 w-4 mr-2" />
            )}
            {isSummarizing ? "generating summary..." : "generate summary"}
          </Button>
        </div>
      )}
    </div>
  )
}