import { Meeting, MeetingPrep } from "../types"
import { MeetingCard } from "./meeting-card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { MeetingPrepDetails } from "./meeting-prep-card"
import { useSettings } from "@/lib/hooks/use-settings"

// Mock data for upcoming meetings
const MOCK_UPCOMING_MEETINGS: Meeting[] = [
  {
    id: "1",
    humanName: "Recording demo for screenpipe",
    meetingStart: "2024-01-30T15:00:00",
    meetingEnd: "2024-01-30T17:00:00",
    agenda: "screenpipe intelligence showcasing example app of meeting assistant called granola 2.0. Participants record a studio quality demo of the product, talking about its feature and overall company advancements",
    aiSummary: null,
    participants_invited: ["louis beaumont", "matt diakonov"],
    recurrence: "weekly on thursday",
    aiName: null,
    participants: null,
    selectedDevices: new Set(),
    deviceNames: new Set(),
    segments: [],
    notes: [],
    aiPrep: {
      previousContext: {
        lastInteraction: "2024-01-23: LinkedIn Agent Demo",
        personContext: {
          "louis beaumont": {
            personality: "analytical, detail-oriented, values clear communication",
            communicationStyle: "prefers structured discussions with visual aids",
            pastDecisions: [
              "successful demo format: technical but consumer-focused",
              "single-take recording approach with good preparation"
            ],
            strengths: ["technical architecture", "demo execution"],
            challenges: ["audio quality needs improvement - stay closer to mic"]
          }
        },
        agreedNextSteps: [
          "maintain focus on technical consumer use-cases",
          "improve audio setup for next recording",
          "continue weekly agent showcase format"
        ]
      },
      suggestedPrep: {
        reviewPoints: [
          "review linkedin agent demo performance: 3500 views, 50+ likes on twitter",
          "check audio setup and mic positioning",
          "prepare this week's featured agent demo"
        ],
        discussionTopics: [
          "desktop agents platform positioning",
          "weekly agent showcase strategy",
          "demo format improvements"
        ],
        meetingTips: [
          "maintain eye contact with camera",
          "single-take approach: pause and reset if needed",
          "memorize key points before looking back at camera",
          "position closer to mic for better audio",
          "emphasize platform capabilities through agent examples"
        ]
      }
    }
  },
  {
    id: "2",
    humanName: "Ship-it at f.inc (accountability group)",
    meetingStart: "2024-01-30T17:00:00",
    meetingEnd: "2024-01-30T18:00:00",
    agenda: "Participants share one liner about startup, progress in the last week, the biggest problem, next week plan",
    aiSummary: null,
    participants_invited: ["Hubert Thieblot", 'all portfolio companies in dev tools', "louis beaumont", "matt diakonov"],
    recurrence: "weekly on thursday",
    aiName: null,
    participants: null,
    selectedDevices: new Set(),
    deviceNames: new Set(),
    segments: [],
    notes: [],
    aiPrep: {
      previousContext: {
        lastInteraction: "2024-01-23: LinkedIn Agent Demo",
        personContext: {
          "louis beaumont": {
            personality: "analytical, detail-oriented, values clear communication",
            communicationStyle: "prefers structured discussions with visual aids",
            pastDecisions: [
              "successful demo format: technical but consumer-focused",
              "single-take recording approach with good preparation"
            ],
            strengths: ["technical architecture", "demo execution"],
            challenges: ["audio quality needs improvement - stay closer to mic"]
          }
        },
        agreedNextSteps: [
          "maintain focus on technical consumer use-cases",
          "improve audio setup for next recording",
          "continue weekly agent showcase format"
        ]
      },
      suggestedPrep: {
        reviewPoints: [
          "review linkedin agent demo performance: 3500 views, 50+ likes on twitter",
          "check audio setup and mic positioning",
          "prepare this week's featured agent demo"
        ],
        discussionTopics: [
          "desktop agents platform positioning",
          "weekly agent showcase strategy",
          "demo format improvements"
        ],
        meetingTips: [
          "maintain eye contact with camera",
          "single-take approach: pause and reset if needed",
          "memorize key points before looking back at camera",
          "position closer to mic for better audio",
          "emphasize platform capabilities through agent examples"
        ]
      }
    }
  },
  {
    id: "3",
    humanName: "English class with Kelly 🇺🇸 🔥 Speaking, Grammar",
    meetingStart: "2024-01-30T19:30:00",
    meetingEnd: "2024-01-30T19:55:00",
    agenda: "Read outloud to fix pronounciation issues, thick russian accent, grammar mistakes",
    aiSummary: null,
    recurrence: "daily",
    aiName: null,
    participants: null,
    selectedDevices: new Set(),
    deviceNames: new Set(),
    segments: [],
    notes: [],
    aiPrep: {
      previousContext: {
        lastInteraction: "2024-01-23: LinkedIn Agent Demo",
        personContext: {
          "louis beaumont": {
            personality: "analytical, detail-oriented, values clear communication",
            communicationStyle: "prefers structured discussions with visual aids",
            pastDecisions: [
              "successful demo format: technical but consumer-focused",
              "single-take recording approach with good preparation"
            ],
            strengths: ["technical architecture", "demo execution"],
            challenges: ["audio quality needs improvement - stay closer to mic"]
          }
        },
        agreedNextSteps: [
          "maintain focus on technical consumer use-cases",
          "improve audio setup for next recording",
          "continue weekly agent showcase format"
        ]
      },
      suggestedPrep: {
        reviewPoints: [
          "review linkedin agent demo performance: 3500 views, 50+ likes on twitter",
          "check audio setup and mic positioning",
          "prepare this week's featured agent demo"
        ],
        discussionTopics: [
          "desktop agents platform positioning",
          "weekly agent showcase strategy",
          "demo format improvements"
        ],
        meetingTips: [
          "maintain eye contact with camera",
          "single-take approach: pause and reset if needed",
          "memorize key points before looking back at camera",
          "position closer to mic for better audio",
          "emphasize platform capabilities through agent examples"
        ]
      }
    }
  },
  {
    id: "4",
    humanName: "b2b between Matthew Diakonov and Mauricio Matsumoto Dias",
    meetingStart: "2024-01-31T10:00:00",
    meetingEnd: "2024-01-31T10:30:00",
    agenda: "Enterprise deal with the largest ERP system in Brazil - TOTVS, regular meeting to manage progress of POC",
    aiSummary: null,
    participants_invited: [
      "Matthew Diakonov",
      "jose.cnascimento@totvs.com.br",
      "leandro.costa@totvs.com.br",
      "louis beaumont",
      "lucas.pontes@totvs.com.br",
      "mauricio.dias@totvs.com.br",
      "thiago.buissa@totvs.com.br"
    ],
    guestCount: 7,
    confirmedCount: 7,
    organizer: "Matthew Diakonov",
    aiName: null,
    participants: null,
    selectedDevices: new Set(),
    deviceNames: new Set(),
    segments: [],
    notes: [],
    aiPrep: {
      previousContext: {
        lastInteraction: "2024-01-24: Initial POC planning",
        personContext: {
          "mauricio.dias@totvs.com.br": {
            personality: "pragmatic decision maker, values ROI discussions",
            communicationStyle: "direct, appreciates concrete examples",
            pastDecisions: [
              "approved initial POC scope",
              "requested additional security compliance details"
            ],
            strengths: ["strategic thinking", "enterprise software experience"],
            challenges: ["tight schedule, needs quick wins"]
          }
        },
        agreedNextSteps: [
          "provide detailed security documentation",
          "schedule technical team introduction"
        ]
      },
      suggestedPrep: {
        reviewPoints: [
          "review POC success metrics",
          "check status of security compliance docs"
        ],
        discussionTopics: [
          "timeline for initial deployment",
          "integration requirements clarification"
        ],
        meetingTips: [
          "focus on business value first",
          "have technical team on standby for detailed questions",
          "prepare specific TOTVS use cases"
        ]
      }
    }
  },
  {
    id: "5",
    humanName: "Dentist Stockton",
    meetingStart: "2024-01-31T14:30:00",
    meetingEnd: "2024-01-31T15:30:00",
    agenda: "Cleaning teeth - important to keep log of daily dental log and notice any issues early on",
    aiSummary: null,
    recurrence: "every half a year",
    aiName: null,
    participants: null,
    selectedDevices: new Set(),
    deviceNames: new Set(),
    segments: [],
    notes: [],
    aiPrep: {
      previousContext: {
        lastInteraction: "2024-01-23: LinkedIn Agent Demo",
        personContext: {
          "louis beaumont": {
            personality: "analytical, detail-oriented, values clear communication",
            communicationStyle: "prefers structured discussions with visual aids",
            pastDecisions: [
              "successful demo format: technical but consumer-focused",
              "single-take recording approach with good preparation"
            ],
            strengths: ["technical architecture", "demo execution"],
            challenges: ["audio quality needs improvement - stay closer to mic"]
          }
        },
        agreedNextSteps: [
          "maintain focus on technical consumer use-cases",
          "improve audio setup for next recording",
          "continue weekly agent showcase format"
        ]
      },
      suggestedPrep: {
        reviewPoints: [
          "review linkedin agent demo performance: 3500 views, 50+ likes on twitter",
          "check audio setup and mic positioning",
          "prepare this week's featured agent demo"
        ],
        discussionTopics: [
          "desktop agents platform positioning",
          "weekly agent showcase strategy",
          "demo format improvements"
        ],
        meetingTips: [
          "maintain eye contact with camera",
          "single-take approach: pause and reset if needed",
          "memorize key points before looking back at camera",
          "position closer to mic for better audio",
          "emphasize platform capabilities through agent examples"
        ]
      }
    }
  }
] 

export function UpcomingMeetings() {
  const { settings } = useSettings()
  
  const handleUpdate = (id: string, update: { aiName?: string; aiSummary?: string }) => {
    console.log("updating meeting:", id, update)
  }

  const getUpcomingTime = (meetingStart: string) => {
    // For testing/demo purposes, use a fixed "now" date that's before our mock data
    const now = new Date("2024-01-30T12:00:00") // Set to a time before our first mock meeting
    const meetingTime = new Date(meetingStart)
    const diffMs = meetingTime.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    // console.log('time diff:', { now: now.toISOString(), meeting: meetingTime.toISOString(), diffMins, diffHours, diffDays })

    if (diffDays > 0) {
      return ['in', `${diffDays}d`]
    } else if (diffHours > 0) {
      return ['in', `${diffHours}h`]
    } else if (diffMins > 0) {
      return ['in', `${diffMins}m`]
    } else {
      return ['', 'now']
    }
  }

  return (
    <div className="space-y-2">
      {MOCK_UPCOMING_MEETINGS.map((meeting) => (
        <div key={meeting.id} className="relative">
          <div className="absolute -left-0 z-10 -top-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-accent rounded px-1 border border-border/40">
              {meeting.humanName?.toLowerCase().includes("recording demo") && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
              {meeting.humanName?.toLowerCase().includes("recording demo") ? 
                "now" : 
                `${getUpcomingTime(meeting.meetingStart)[0]} ${getUpcomingTime(meeting.meetingStart)[1]}`}
            </div>
          </div>
          <MeetingCard meeting={meeting} onUpdate={handleUpdate} settings={settings} />
        </div>
      ))}
    </div>
  )
} 