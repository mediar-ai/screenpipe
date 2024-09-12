import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OpenAI } from "openai";
import { useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "./ui/use-toast";
import ReactMarkdown from 'react-markdown';

function setItem(key: string, value: any): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function getItem(key: string): any {
  if (typeof window !== 'undefined') {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  }
  return null;
}

interface Transcription {
  id: number;
  timestamp: string;
  transcription: string;
}

interface Meeting {
  meeting_group: number;
  meeting_start: string;
  meeting_end: string;
  full_transcription: string;
  name: string | null;
  participants: string | null;
  summary: string | null;
}

interface AudioContent {
  chunk_id: number;
  transcription: string;
  timestamp: string;
  file_path: string;
  offset_index: number;
}

interface AudioTranscription {
  type: "Audio";
  content: AudioContent;
}

export default function MeetingHistory() {
  console.log("MeetingHistory component rendered");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const { settings } = useSettings();
  const { toast } = useToast();

  useEffect(() => {
    console.log("useEffect running, isOpen:", isOpen);
    if (isOpen) {
      loadMeetings();
    }
  }, [isOpen]);

  async function loadMeetings() {
    setLoading(true);
    try {
      const storedMeetings = getItem('meetings') || [];
      setMeetings(storedMeetings);
      
      await fetchMeetings();
    } catch (err) {
      setError("Failed to load meetings");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMeetings() {
    console.log("Fetching meetings...");
    setLoading(true);
    try {
      let startTime;
      const storedMeetings = getItem('meetings') || [];
      if (storedMeetings.length > 0) {
        // Get the end time of the last stored meeting
        const lastMeeting = storedMeetings[storedMeetings.length - 1];
        startTime = new Date(lastMeeting.meeting_end).toISOString();
      } else {
        // If no stored meetings, search from 7 days ago
        startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      console.log("Searching from:", startTime);
      const response = await fetch(`http://localhost:3030/search?content_type=audio&start_time=${startTime}&limit=1000`);
      if (!response.ok) {
        throw new Error("Failed to fetch meeting history");
      }
      const result = await response.json();
      console.log("Fetch result:", result);
      const newMeetings = processMeetings(result.data);
      console.log("Processed new meetings:", newMeetings);
      
      // Combine new meetings with stored meetings
      const updatedMeetings = [...storedMeetings, ...newMeetings];
      setMeetings(updatedMeetings);
      setItem('meetings', updatedMeetings);
    } catch (err) {
      setError("Failed to fetch meeting history");
      console.error("Fetch error:", err);
    } finally {
      console.log("Fetch completed");
      setLoading(false);
    }
  }

  async function generateSummary(meeting: Meeting) {
    setIsSummarizing(true);
    try {
      const openai = new OpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const model = settings.aiModel;
      const customPrompt = settings.customPrompt || "";

      const messages = [
        {
          role: "system" as const,
          content: `You are a helpful assistant that summarizes meetings. ${customPrompt}`,
        },
        {
          role: "user" as const,
          content: `Please provide a concise summary of the following meeting transcript:\n\n${meeting.full_transcription}`,
        },
      ];

      const response = await openai.chat.completions.create({
        model: model,
        messages: messages,
      });

      const summary = response.choices[0]?.message?.content || "No summary generated.";

      // Update the meeting with the new summary
      const updatedMeeting = { ...meeting, summary };
      const updatedMeetings = meetings.map(m => m.meeting_group === meeting.meeting_group ? updatedMeeting : m);
      setMeetings(updatedMeetings);
      setItem('meetings', updatedMeetings);

      toast({
        title: "Summary Generated",
        description: "The meeting summary has been created successfully.",
      });
    } catch (error) {
      console.error("Error generating summary:", error);
      toast({
        title: "Error",
        description: "Failed to generate meeting summary. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSummarizing(false);
    }
  }

  async function identifyParticipants(meeting: Meeting) {
    setIsIdentifying(true);
    try {
      const openai = new OpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const model = settings.aiModel;

      const messages = [
        {
          role: "system" as const,
          content: "You are an assistant that identifies participants in meeting transcripts.",
        },
        {
          role: "user" as const,
          content: `Please identify the participants in this meeting transcript. Try to understand if there are multiple people or the person is talking to themselves, or if the transcript is just a youtube video or similar. Provide a comma-separated list of one or two word names or roles or characteristics. If it is not possible to identify then respond with N/A, Transcriptions: :\n\n${meeting.full_transcription}`,
        },
      ];

      const response = await openai.chat.completions.create({
        model: model,
        messages: messages,
      });

      const participants = response.choices[0]?.message?.content || "No participants identified.";

      // Update the meeting with the identified participants
      const updatedMeeting = { ...meeting, participants };
      const updatedMeetings = meetings.map(m => m.meeting_group === meeting.meeting_group ? updatedMeeting : m);
      setMeetings(updatedMeetings);
      setItem('meetings', updatedMeetings);

      toast({
        title: "Participants Identified",
        description: "The meeting participants have been identified successfully.",
      });
    } catch (error) {
      console.error("Error identifying participants:", error);
      toast({
        title: "Error",
        description: "Failed to identify meeting participants. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsIdentifying(false);
    }
  }

  function processMeetings(transcriptions: AudioTranscription[]): Meeting[] {
    console.log("Processing transcriptions:", transcriptions);
    let meetings: Meeting[] = [];
    let currentMeeting: Meeting | null = null;
    let meetingGroup = 0;

    transcriptions.sort((a, b) => new Date(a.content.timestamp).getTime() - new Date(b.content.timestamp).getTime());

    transcriptions.forEach((trans, index) => {
      const currentTime = new Date(trans.content.timestamp);
      const prevTime = index > 0 ? new Date(transcriptions[index - 1].content.timestamp) : null;

      if (!currentMeeting || (prevTime && (currentTime.getTime() - prevTime.getTime()) >= 5 * 60 * 1000)) {
        if (currentMeeting) {
          meetings.push(currentMeeting);
        }
        meetingGroup++;
        currentMeeting = {
          meeting_group: meetingGroup,
          meeting_start: trans.content.timestamp,
          meeting_end: trans.content.timestamp,
          full_transcription: `${trans.content.timestamp} ${trans.content.transcription}\n`,
          name: null,
          participants: null,
          summary: null,
        };
      } else if (currentMeeting) {
        currentMeeting.meeting_end = trans.content.timestamp;
        currentMeeting.full_transcription += `${trans.content.timestamp} ${trans.content.transcription}\n`;
      }
    });

    if (currentMeeting) {
      meetings.push(currentMeeting);
    }

    console.log("Processed meetings:", meetings);
    return meetings.filter(m => m.full_transcription.replace(/\n/g, '').length >= 200);
  }

  console.log("Rendering meetings:", meetings);

  // Sort meetings in reverse chronological order
  const sortedMeetings = [...meetings].sort((a, b) => 
    new Date(b.meeting_start).getTime() - new Date(a.meeting_start).getTime()
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" onClick={() => setIsOpen(true)}>meetings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-full w-full max-h-full h-full p-0 border-none">
        <DialogHeader className="px-4 py-2 border-b flex-shrink-0">
          <DialogTitle>Meeting and conversation history</DialogTitle>
        </DialogHeader>
        <div className="flex-grow overflow-auto p-4">
          {loading && <p>Loading meeting history...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {meetings.length === 0 && !loading && !error && <p>No meetings found.</p>}
          <div className="space-y-4">
            {sortedMeetings.map((meeting, index) => (
              <div key={index} className="p-4 border rounded">
                <h3 className="font-bold">
                  {`Meeting ${new Date(meeting.meeting_start).toLocaleDateString()}, ${new Date(meeting.meeting_start).toLocaleTimeString()} - ${new Date(meeting.meeting_end).toLocaleTimeString()}`}
                </h3>
                <p className="flex items-center">
                  Participants: {meeting.participants || ''}
                  {!meeting.participants && (
                    <Button
                    onClick={() => identifyParticipants(meeting)}
                    disabled={isIdentifying}
                    className="ml-2 px-2 py-0.5 text-[10px] bg-black text-white hover:bg-gray-800 h-5 min-h-0"
                    >
                    {isIdentifying ? "Identifying..." : "Identify"}
                    </Button>
                  )}
                </p>
                {meeting.summary ? (
                  <div>
                    <h4 className="font-semibold mt-2">Summary:</h4>
                    <ReactMarkdown className="prose max-w-none">
                      {meeting.summary}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <Button
                    onClick={() => generateSummary(meeting)}
                    disabled={isSummarizing}
                    className="mt-2"
                  >
                    {isSummarizing ? "Generating Summary..." : "Generate Summary"}
                  </Button>
                )}
                <div className="mt-4">
                  <h4 className="font-semibold">Full Transcription:</h4>
                  <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded mt-2 text-sm max-h-40 overflow-y-auto">
                    {meeting.full_transcription}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
