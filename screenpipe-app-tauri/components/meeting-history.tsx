import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OpenAI } from "openai";
import { useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "./ui/use-toast";
import ReactMarkdown from "react-markdown";
import { X, Activity, Copy } from "lucide-react"; // Import the X icon and Activity icon for live meetings
import { useInterval } from "@/lib/hooks/use-interval"; // Add this import
import { usePostHog } from "posthog-js/react";
import debounce from "lodash/debounce";
import { Badge } from "./ui/badge";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import localforage from "localforage";

async function setItem(key: string, value: any): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      await localforage.setItem(key, value);
    }
  } catch (error) {
    console.error("error setting item in storage:", error);
    throw error;
  }
}

async function getItem(key: string): Promise<any> {
  try {
    if (typeof window !== "undefined") {
      return await localforage.getItem(key);
    }
  } catch (error) {
    console.error("error getting item from storage:", error);
    throw error;
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
  const posthog = usePostHog();
  const { settings } = useSettings();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const { toast } = useToast();
  const [showError, setShowError] = useState(false);
  const [liveMeetings, setLiveMeetings] = useState<Set<number>>(new Set());
  const { copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

  const debouncedCapture = useCallback(
    debounce((eventName: string, properties: any) => {
      posthog?.capture(eventName, properties);
    }, 300),
    [posthog]
  );

  useEffect(() => {
    if (posthog) {
      posthog.identify(settings.userId);
      posthog.people.set({
        userId: settings.userId,
        // Add any other relevant user properties
      });
    }
  }, [posthog, settings.userId]);

  useEffect(() => {
    console.log("useEffect running, isOpen:", isOpen);
    if (isOpen) {
      loadMeetings();
      debouncedCapture("meeting_history_opened", {
        userId: settings.userId,
      });
    } else {
      debouncedCapture("meeting_history_closed", {
        userId: settings.userId,
      });
    }
  }, [isOpen, settings.userId, debouncedCapture]);

  useEffect(() => {
    setShowError(!!error);
  }, [error]);

  async function loadMeetings() {
    setLoading(true);
    try {
      const storedMeetings = (await getItem("meetings")) || [];
      setMeetings(storedMeetings);

      await fetchMeetings();
    } catch (err) {
      setError("failed to load meetings");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMeetings() {
    console.log("fetching meetings...");
    setLoading(true);
    try {
      let startTime;
      const storedMeetings = (await getItem("meetings")) || [];
      if (storedMeetings.length > 0) {
        // Get the start time of the last stored meeting
        const lastMeeting = storedMeetings[storedMeetings.length - 1];
        startTime = new Date(lastMeeting.meeting_start).toISOString();
      } else {
        // If no stored meetings, search from 7 days ago
        startTime = new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toISOString();
      }
      console.log("searching from:", startTime);

      const response = await fetch(
        `http://localhost:3030/search?content_type=audio&start_time=${startTime}&limit=1000`
      );
      if (!response.ok) {
        throw new Error("failed to fetch meeting history");
      }
      const result = await response.json();
      console.log("fetch result:", result);
      const newMeetings = processMeetings(result.data);
      console.log("processed new meetings:", newMeetings);

      const newLiveMeetings = new Set(liveMeetings);

      // Merge new meetings with stored meetings, updating the last meeting if necessary
      let updatedMeetings = [...storedMeetings];
      newMeetings.forEach((newMeeting) => {
        const existingMeetingIndex = updatedMeetings.findIndex(
          (m) => m.meeting_group === newMeeting.meeting_group
        );
        if (existingMeetingIndex !== -1) {
          // Update existing meeting
          updatedMeetings[existingMeetingIndex] = {
            ...updatedMeetings[existingMeetingIndex],
            ...newMeeting,
            full_transcription:
              updatedMeetings[existingMeetingIndex].full_transcription +
              newMeeting.full_transcription,
          };
        } else {
          // Add new meeting
          updatedMeetings.push(newMeeting);
        }

        if (isLiveMeeting(newMeeting)) {
          if (!liveMeetings.has(newMeeting.meeting_group)) {
            sendNotification(
              "live meeting started",
              `a live meeting started at ${new Date(
                newMeeting.meeting_start
              ).toLocaleTimeString()}`
            );
            newLiveMeetings.add(newMeeting.meeting_group);
          }
        } else if (liveMeetings.has(newMeeting.meeting_group)) {
          sendNotification("meeting ended", `the meeting has ended`);
          newLiveMeetings.delete(newMeeting.meeting_group);
        }
      });

      setLiveMeetings(newLiveMeetings);
      setMeetings(updatedMeetings);

      // Only store completed meetings
      const completedMeetings = updatedMeetings.filter(
        (meeting) => !isLiveMeeting(meeting)
      );
      await setItem("meetings", completedMeetings);
    } catch (err) {
      setError(
        "some trouble fetching new meetings. please check health status."
      );
      console.error("fetch error:", err);
    } finally {
      console.log("fetch completed");
      setLoading(false);
    }
  }

  async function sendNotification(title: string, body: string) {
    try {
      const response = await fetch("http://localhost:11435/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body }),
      });

      if (!response.ok) {
        throw new Error(`http error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("notification sent successfully:", result);
    } catch (error) {
      console.error("failed to send notification:", error);
    }
  }

  async function generateSummary(meeting: Meeting) {
    setIsSummarizing(true);
    debouncedCapture("summary_generation_started", {
      userId: settings.userId,
      meetingId: meeting.meeting_group,
    });
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
          content: `you are a helpful assistant that summarizes meetings. ${customPrompt}`,
        },
        {
          role: "user" as const,
          content: `please provide a concise summary of the following meeting transcript:\n\n${meeting.full_transcription}`,
        },
      ];

      const stream = await openai.chat.completions.create({
        model: model,
        messages: messages,
        stream: true,
      });

      let summary = "";
      const updatedMeeting = { ...meeting, summary: "" };

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        summary += content;
        updatedMeeting.summary = summary;

        // update the meeting with the new summary
        const updatedMeetings = meetings.map((m) =>
          m.meeting_group === meeting.meeting_group ? updatedMeeting : m
        );
        setMeetings(updatedMeetings);
      }

      // final update after streaming is complete
      const finalUpdatedMeetings = meetings.map((m) =>
        m.meeting_group === meeting.meeting_group ? updatedMeeting : m
      );
      setMeetings(finalUpdatedMeetings);

      try {
        console.log("updating meetings state...");
        setMeetings(finalUpdatedMeetings);

        console.log("storing meetings in storage...");
        await setItem("meetings", finalUpdatedMeetings);

        console.log("storage operation completed");

        toast({
          title: "summary generated",
          description:
            "the meeting summary has been created and saved successfully.",
        });
      } catch (storageError) {
        console.error("error updating storage:", storageError);
        toast({
          title: "warning",
          description:
            "summary generated but couldn't be saved due to storage limits. older meetings might be removed to make space.",
          variant: "destructive",
        });

        // attempt to remove older meetings to make space
        try {
          const oldMeetings = (await getItem("meetings")) || [];
          const meetingsToKeep = oldMeetings.slice(-10); // keep only the last 10 meetings
          await setItem("meetings", meetingsToKeep);
          setMeetings(meetingsToKeep);
          toast({
            title: "storage cleaned",
            description:
              "older meetings were removed to make space for new ones.",
          });
        } catch (cleanupError) {
          console.error("failed to clean up storage:", cleanupError);
          toast({
            title: "error",
            description:
              "failed to clean up storage. please clear your browser data manually.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("error generating summary:", error);
      toast({
        title: "error",
        description: "failed to generate meeting summary. please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSummarizing(false);
    }
  }

  async function identifyParticipants(meeting: Meeting) {
    setIsIdentifying(true);
    debouncedCapture("participant_identification_started", {
      userId: settings.userId,
      meetingId: meeting.meeting_group,
    });
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
          content:
            "you are an assistant that identifies participants in meeting transcripts.",
        },
        {
          role: "user" as const,
          content: `please identify the participants in this meeting transcript. try to understand if there are multiple people or the person is talking to themselves, or if the transcript is just a youtube video or similar. provide a comma-separated list of one or two word names or roles or characteristics. if it is not possible to identify then respond with n/a, transcriptions: :\n\n${meeting.full_transcription}`,
        },
      ];

      const response = await openai.chat.completions.create({
        model: model,
        messages: messages,
      });

      const participants =
        response.choices[0]?.message?.content || "no participants identified.";

      // Update the meeting with the identified participants
      const updatedMeeting = { ...meeting, participants };
      const updatedMeetings = meetings.map((m) =>
        m.meeting_group === meeting.meeting_group ? updatedMeeting : m
      );
      setMeetings(updatedMeetings);
      await setItem("meetings", updatedMeetings);

      toast({
        title: "participants identified",
        description:
          "the meeting participants have been identified successfully.",
      });
    } catch (error) {
      console.error("error identifying participants:", error);
      toast({
        title: "error",
        description:
          "failed to identify meeting participants. please try again.",
        variant: "destructive",
      });
    } finally {
      setIsIdentifying(false);
    }
  }

  function processMeetings(transcriptions: AudioTranscription[]): Meeting[] {
    console.log("processing transcriptions:", transcriptions);
    let meetings: Meeting[] = [];
    let currentMeeting: Meeting | null = null;
    let meetingGroup = 0;

    transcriptions.sort(
      (a, b) =>
        new Date(a.content.timestamp).getTime() -
        new Date(b.content.timestamp).getTime()
    );

    transcriptions.forEach((trans, index) => {
      const currentTime = new Date(trans.content.timestamp);
      const prevTime =
        index > 0
          ? new Date(transcriptions[index - 1].content.timestamp)
          : null;

      if (
        !currentMeeting ||
        (prevTime &&
          currentTime.getTime() - prevTime.getTime() >= 1 * 60 * 1000)
      ) {
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

    // Merge overlapping or close meetings
    meetings = meetings.reduce((acc, meeting) => {
      const lastMeeting = acc[acc.length - 1];
      if (lastMeeting) {
        const timeDiff =
          new Date(meeting.meeting_start).getTime() -
          new Date(lastMeeting.meeting_end).getTime();
        if (timeDiff < 1 * 60 * 1000) {
          // If less than 1 minute apart, merge
          lastMeeting.meeting_end = meeting.meeting_end;
          lastMeeting.full_transcription += meeting.full_transcription;
          return acc;
        }
      }
      acc.push(meeting);
      return acc;
    }, [] as Meeting[]);

    console.log("processed meetings:", meetings);
    return meetings.filter(
      (m) => m.full_transcription.replace(/\n/g, "").length >= 200
    );
  }

  console.log("rendering meetings:", meetings);

  // Memoize expensive computations
  const sortedMeetings = useMemo(() => {
    return [...meetings].sort(
      (a, b) =>
        new Date(b.meeting_start).getTime() -
        new Date(a.meeting_start).getTime()
    );
  }, [meetings]);

  const isLiveMeeting = (meeting: Meeting) => {
    const lastTranscriptionTime = new Date(meeting.meeting_end);
    const now = new Date();
    return now.getTime() - lastTranscriptionTime.getTime() < 1 * 60 * 1000;
  };

  // Add this useInterval hook
  useInterval(() => {
    if (isOpen) {
      fetchMeetings();
    }
  }, 30000); // 30 seconds

  const copyWithToast = (content: string, type: string) => {
    copyToClipboard(content);
    toast({
      title: "copied to clipboard",
      description: `${type} has been copied to your clipboard.`,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" onClick={() => setIsOpen(true)}>
          meetings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <DialogHeader className="py-4">
          <DialogTitle>
            meeting and conversation history
            <Badge variant="secondary" className="ml-2">
              experimental
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <p className="text-sm text-gray-600">
            this page provides transcriptions and summaries of your daily
            meetings. it uses your ai settings and custom prompt to generate
            summaries. note: phrases like &quot;thank you&quot; or &quot;you
            know&quot; might be transcription errors. for better accuracy,
            consider using deepgram as the engine or adjust your custom prompt
            to ignore these.
            <br />
            <br />
            <strong>make sure to setup your ai settings</strong>
          </p>
        </DialogDescription>
        <div className="flex-grow overflow-auto">
          {loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 border rounded animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-20 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {showError && error && (
                <div
                  className="bg-gray-100 border-l-4 border-black text-gray-700 p-4 mb-4 flex justify-between items-center"
                  role="alert"
                >
                  <div>
                    <p className="font-bold">warning</p>
                    <p>{error}</p>
                  </div>
                  <button
                    onClick={() => setShowError(false)}
                    className="text-gray-700 hover:text-black"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              {meetings.length === 0 && !loading && !error && (
                <p className="text-center">no meetings found.</p>
              )}
              <div className="space-y-6">
                {sortedMeetings.map((meeting, index) => (
                  <div key={index} className="p-4 border rounded relative">
                    {isLiveMeeting(meeting) && (
                      <div className="absolute top-2 right-2 flex items-center text-black">
                        <Activity size={16} className="mr-1" />
                        <span className="text-sm font-semibold">live</span>
                      </div>
                    )}
                    <h3 className="font-bold">
                      {`meeting ${new Date(
                        meeting.meeting_start
                      ).toLocaleDateString()}, ${new Date(
                        meeting.meeting_start
                      ).toLocaleTimeString()} - ${new Date(
                        meeting.meeting_end
                      ).toLocaleTimeString()}`}
                    </h3>
                    <p className="flex items-center">
                      participants: {meeting.participants || ""}
                      {!meeting.participants && (
                        <Button
                          onClick={() => identifyParticipants(meeting)}
                          disabled={isIdentifying}
                          className="ml-2 px-2 py-0.5 text-[10px] bg-black text-white hover:bg-gray-800 h-5 min-h-0"
                        >
                          {isIdentifying ? "identifying..." : "identify"}
                        </Button>
                      )}
                    </p>
                    {isLiveMeeting(meeting) ? (
                      <p className="mt-2 text-sm text-gray-500 italic">
                        summary not available for live meetings
                      </p>
                    ) : meeting.summary ? (
                      <div>
                        <h4 className="font-semibold mt-2 flex items-center">
                          summary:
                          <Button
                            onClick={() =>
                              copyWithToast(meeting.summary || "", "summary")
                            }
                            className="ml-2 p-1 h-6 w-6"
                            variant="outline"
                            size="icon"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </h4>
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
                        {isSummarizing
                          ? "generating summary..."
                          : "generate summary"}
                      </Button>
                    )}
                    <div className="mt-4">
                      <h4 className="font-semibold flex items-center">
                        full transcription:
                        <Button
                          onClick={() =>
                            copyWithToast(
                              meeting.full_transcription,
                              "full transcription"
                            )
                          }
                          className="ml-2 p-1 h-6 w-6"
                          variant="outline"
                          size="icon"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </h4>
                      <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded mt-2 text-sm max-h-40 overflow-y-auto">
                        {meeting.full_transcription}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
