import { MeetingPrep } from "../types"

interface MeetingPrepProps {
  aiPrep: MeetingPrep
}

export function MeetingPrepDetails({ aiPrep }: MeetingPrepProps) {
  return (
    <div className="space-y-2 text-sm border-t border-border pt-2">
      {/* Previous Context */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1">last interaction</div>
        <div className="text-sm">{aiPrep.previousContext.lastInteraction}</div>
      </div>

      {/* Person Context */}
      {Object.entries(aiPrep.previousContext.personContext).map(([person, context]) => (
        <div key={person} className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">about {person}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground font-semibold">personality:</span> {context.personality}
            </div>
            <div>
              <span className="text-muted-foreground font-semibold">communication:</span> {context.communicationStyle}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground font-semibold">strengths:</span> {context.strengths.join(", ")}
            </div>
            <div>
              <span className="text-muted-foreground font-semibold">challenges:</span> {context.challenges.join(", ")}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground font-semibold">key decisions:</span>
              <ul className="list-disc list-inside ml-2">
                {context.pastDecisions.map((decision, i) => (
                  <li key={i}>{decision}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-muted-foreground font-semibold">agreed next steps:</span>
              <ul className="list-disc list-inside ml-2">
                {aiPrep.previousContext.agreedNextSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}

      {/* Suggested Prep */}
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <div className="font-semibold text-muted-foreground mb-1">review points</div>
          <ul className="list-disc list-inside ml-2">
            {aiPrep.suggestedPrep.reviewPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-muted-foreground mb-1">discussion topics</div>
          <ul className="list-disc list-inside ml-2">
            {aiPrep.suggestedPrep.discussionTopics.map((topic, i) => (
              <li key={i}>{topic}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-muted-foreground mb-1">meeting tips</div>
          <ul className="list-disc list-inside ml-2">
            {aiPrep.suggestedPrep.meetingTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
} 