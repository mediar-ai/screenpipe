"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";

import { OpenAI } from "openai";
import { useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "./ui/use-toast";
import ReactMarkdown from "react-markdown";
import {
  X,
  Copy,
  RefreshCw,
  Trash2,
  FileText,
  PlusCircle,
  ChevronDown,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import localforage from "localforage";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "./ui/input";
import { cn, keysToCamelCase } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "./ui/checkbox";

function formatDate(date: string): string {
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = dateObj.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formattedDate} at ${formattedTime}`;
}

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

interface MeetingSegment {
  timestamp: string;
  transcription: string;
  deviceName: string;
  deviceType: string;
  speaker: Speaker;
}

interface Meeting {
  meetingGroup: number;
  meetingStart: string;
  meetingEnd: string;
  fullTranscription: string;
  name: string | null;
  participants: string | null;
  summary: string | null;
  mergedWith?: number[]; // Array of meeting groups merged with this one
  selectedDevices: Set<string>;
  deviceNames: Set<string>;
  segments: MeetingSegment[];
}

interface Speaker {
  id: number;
  name: string;
}

interface AudioContent {
  chunkId: number;
  transcription: string;
  timestamp: string;
  filePath: string;
  offsetIndex: number;
  tags: string[];
  deviceName: string;
  deviceType: string;
  speaker: Speaker;
}

interface AudioTranscription {
  type: "Audio";
  content: AudioContent;
}

export default function MeetingHistory({
  showMeetingHistory,
  setShowMeetingHistory,
  className,
}: {
  showMeetingHistory: boolean;
  setShowMeetingHistory: (show: boolean) => void;
  className?: string;
}) {
  const { settings } = useSettings();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const { toast } = useToast();
  const [showError, setShowError] = useState(false);
  const { copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [customSummaryPrompt, setCustomSummaryPrompt] = useState<string>(
    "please provide a concise summary of the following meeting transcript"
  );
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (showMeetingHistory) {
      loadMeetings();
    }
  }, [showMeetingHistory]);

  useEffect(() => {
    setShowError(!!error);
  }, [error]);

  useEffect(() => {
    console.log("Dialog state changed:", showMeetingHistory);
  }, [showMeetingHistory]);

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
      // Always fetch from the last 7x24 hours
      const startTime = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      console.log("searching from:", startTime);

      const response = await fetch(
        `http://localhost:3030/search?content_type=audio&start_time=${startTime}&limit=1000`
      );
      if (!response.ok) {
        throw new Error("failed to fetch meeting history");
      }
      const result = await response.json();
      const camelCaseResult = keysToCamelCase<{ data: AudioTranscription[] }>(
        result
      );
      console.log("fetch result:", camelCaseResult);
      const newMeetings = processMeetings(camelCaseResult.data);
      console.log("processed new meetings:", newMeetings);

      // merge new meetings with stored meetings, updating existing ones
      let updatedMeetings = [...meetings];
      newMeetings.forEach((newMeeting) => {
        const existingMeetingIndex = updatedMeetings.findIndex(
          (m) => m.meetingGroup === newMeeting.meetingGroup
        );
        if (existingMeetingIndex === -1) {
          // add new meeting if it doesn't exist
          updatedMeetings.push(newMeeting);
        } else {
          // update existing meeting with new data
          updatedMeetings[existingMeetingIndex] = {
            ...updatedMeetings[existingMeetingIndex],
            ...newMeeting,
            fullTranscription:
              updatedMeetings[existingMeetingIndex].fullTranscription +
              newMeeting.fullTranscription,
          };
        }
      });

      // sort meetings by start time (descending)
      updatedMeetings.sort(
        (a, b) =>
          new Date(b.meetingStart).getTime() -
          new Date(a.meetingStart).getTime()
      );

      setMeetings(updatedMeetings);

      // store updated meetings
      await setItem("meetings", updatedMeetings);
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

  async function generateSummary(meeting: Meeting) {
    setIsSummarizing(true);

    try {
      const openai = new OpenAI({
        apiKey: settings.openaiApiKey,
        baseURL: settings.aiUrl,
        dangerouslyAllowBrowser: true,
      });

      const model = settings.aiModel;

      // create an enhanced prompt that includes identified participants
      const enhancedPrompt = meeting.participants
        ? `${customSummaryPrompt}\n\nparticipants: ${meeting.participants}`
        : customSummaryPrompt;

      const messages = [
        {
          role: "system" as const,
          content: `you are a helpful assistant that summarizes meetings. `,
        },
        {
          role: "user" as const,
          content: `${enhancedPrompt}:\n\n${meeting.segments
            .map((s) => s.transcription)
            .join("\n")}`,
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
          m.meetingGroup === meeting.meetingGroup ? updatedMeeting : m
        );
        setMeetings(updatedMeetings);
      }

      // final update after streaming is complete
      const finalUpdatedMeetings = meetings.map((m) =>
        m.meetingGroup === meeting.meetingGroup ? updatedMeeting : m
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

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }

  function processMeetings(transcriptions: AudioTranscription[]): Meeting[] {
    console.log("processing transcriptions:", transcriptions);
    let meetings: Meeting[] = [];
    let currentMeeting: Meeting | null = null;
    let meetingGroup = 0;

    // sort transcriptions by timestamp
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

      // Get speaker name based on speaker info or device type
      const speakerName =
        trans.content.speaker?.name && trans.content.speaker.name.length > 0
          ? trans.content.speaker.name
          : trans.content.deviceType?.toLowerCase() === "input"
          ? "you"
          : trans.content.deviceType?.toLowerCase() === "output"
          ? "others"
          : "unknown";

      if (
        !currentMeeting ||
        (prevTime &&
          currentTime.getTime() - prevTime.getTime() >= 5 * 60 * 1000) // increased to 5 minutes
      ) {
        if (currentMeeting) {
          meetings.push(currentMeeting);
        }
        meetingGroup++;
        currentMeeting = {
          meetingGroup: meetingGroup,
          meetingStart: trans.content.timestamp,
          meetingEnd: trans.content.timestamp,
          fullTranscription: `${formatTimestamp(
            trans.content.timestamp
          )} [${speakerName}] ${trans.content.transcription}\n`,
          name: null,
          participants: null,
          summary: null,
          selectedDevices: new Set([trans.content.deviceName]),
          segments: [
            {
              timestamp: trans.content.timestamp,
              transcription: trans.content.transcription,
              deviceName: trans.content.deviceName,
              deviceType: trans.content.deviceType,
              speaker: trans.content.speaker || {
                id: -1,
                name: speakerName,
              },
            },
          ],
          deviceNames: new Set([trans.content.deviceName]),
        };
      } else if (currentMeeting) {
        currentMeeting.meetingEnd = trans.content.timestamp;
        currentMeeting.fullTranscription += `${formatTimestamp(
          trans.content.timestamp
        )} [${speakerName}] ${trans.content.transcription}\n`;
        currentMeeting.selectedDevices.add(trans.content.deviceName);
        currentMeeting.segments.push({
          timestamp: trans.content.timestamp,
          transcription: trans.content.transcription,
          deviceName: trans.content.deviceName,
          deviceType: trans.content.deviceType,
          speaker: trans.content.speaker || {
            id: -1,
            name: speakerName,
          },
        });
        currentMeeting.deviceNames.add(trans.content.deviceName);
      }
    });

    if (currentMeeting) {
      meetings.push(currentMeeting);
    }

    // sort meetings by start time
    meetings.sort(
      (a, b) =>
        new Date(b.meetingStart).getTime() - new Date(a.meetingStart).getTime()
    );

    // remove duplicate meetings
    meetings = meetings.filter(
      (meeting, index, self) =>
        index === self.findIndex((t) => t.meetingGroup === meeting.meetingGroup)
    );

    console.log("processed meetings:", meetings);
    return meetings.filter(
      (m) => m.fullTranscription.replace(/\n/g, "").length >= 200
    );
  }

  // Memoize expensive computations
  const sortedMeetings = useMemo(() => {
    return [...meetings].sort(
      (a, b) =>
        new Date(b.meetingStart).getTime() - new Date(a.meetingStart).getTime()
    );
  }, [meetings]);

  const copyWithToast = (content: string, type: string) => {
    copyToClipboard(content);
    toast({
      title: "copied to clipboard",
      description: `${type} has been copied to your clipboard.`,
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchMeetings();
      toast({
        title: "meetings refreshed",
        description: "your meeting history has been updated.",
      });
    } catch (error) {
      console.error("error refreshing meetings:", error);
      toast({
        title: "refresh failed",
        description: "failed to refresh meetings. please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearMeetings = async () => {
    setIsClearing(true);
    try {
      await localforage.removeItem("meetings");
      setMeetings([]);
      toast({
        title: "meeting data cleared",
        description: "all stored meeting data has been removed.",
      });
    } catch (error) {
      console.error("error clearing meeting data:", error);
      toast({
        title: "error",
        description: "failed to clear meeting data. please try again.",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  };

  const mergeMeetings = (index: number) => {
    const updatedMeetings = [...meetings];
    const currentMeeting = updatedMeetings[index];
    const nextMeeting = updatedMeetings[index + 1];

    const mergedMeeting: Meeting = {
      ...currentMeeting,
      meetingEnd: new Date(
        Math.max(
          new Date(currentMeeting.meetingEnd).getTime(),
          new Date(nextMeeting.meetingEnd).getTime()
        )
      ).toISOString(),
      meetingStart: new Date(
        Math.min(
          new Date(currentMeeting.meetingStart).getTime(),
          new Date(nextMeeting.meetingStart).getTime()
        )
      ).toISOString(),
      fullTranscription: `${currentMeeting.fullTranscription}\n${nextMeeting.fullTranscription}`,
      mergedWith: [
        ...(currentMeeting.mergedWith || []),
        nextMeeting.meetingGroup,
        ...(nextMeeting.mergedWith || []),
      ],
      segments: [...currentMeeting.segments, ...nextMeeting.segments],
      selectedDevices: new Set([
        ...Array.from(currentMeeting.selectedDevices),
        ...Array.from(nextMeeting.selectedDevices),
      ]),
    };

    updatedMeetings[index] = mergedMeeting;
    updatedMeetings.splice(index + 1, 1); // remove the next meeting
    setMeetings(updatedMeetings);
    setItem("meetings", updatedMeetings);
  };

  const handleDeviceToggle = useCallback(
    (meetingGroup: number, deviceName: string, isChecked: boolean) => {
      setMeetings((prevMeetings) => {
        return prevMeetings.map((meeting) => {
          if (meeting.meetingGroup === meetingGroup) {
            const updatedSelectedDevices = new Set(meeting.selectedDevices);
            if (isChecked) {
              updatedSelectedDevices.add(deviceName);
            } else {
              updatedSelectedDevices.delete(deviceName);
            }
            return {
              ...meeting,
              selectedDevices: updatedSelectedDevices,
            };
          }
          return meeting;
        });
      });
    },
    []
  );

  return (
    <Card>
      <CardContent
        className="h-full"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <CardHeader className="py-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              meeting and conversation history
              <Badge variant="secondary" className="ml-2">
                experimental
              </Badge>
            </div>
            <div className="flex space-x-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleClearMeetings}
                      disabled={isClearing}
                      size="sm"
                      variant="outline"
                      className="text-xs"
                    >
                      {isClearing ? (
                        <Trash2 className="h-4 w-4 animate-pulse" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="ml-2">reset data</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>
                      this will restore your meeting data to the original state
                      based on transcription timestamps,
                      <br />
                      without the editing you have done here
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      size="sm"
                      variant="outline"
                      className="text-xs "
                    >
                      {isRefreshing ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2">refresh</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>fetch latest meeting data</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardTitle>
        </CardHeader>
        <CardDescription className="mb-4">
          <span className="block text-sm text-gray-600">
            this page provides transcriptions and summaries of your daily
            meetings. it uses your ai settings to generate summaries. note:
            phrases like &quot;thank you&quot; or &quot;you know&quot; might be
            transcription errors. for better accuracy, consider using deepgram
            as the engine or adjust your prompt to ignore these.
          </span>
          <span className="block text-sm text-gray-600 mt-2">
            <strong>make sure to setup your ai settings</strong>
          </span>
        </CardDescription>
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
                  <React.Fragment key={index}>
                    <Card className="relative">
                      <CardHeader>
                        <div className="grid grid-cols-2">
                          <div>
                            <CardTitle className="text-lg font-semibold flex flex-wrap items-center gap-2">
                              meeting {meeting.meetingGroup}
                              {meeting.mergedWith &&
                                meeting.mergedWith.length > 0 && (
                                  <>
                                    <Badge variant="secondary">merged</Badge>
                                    {meeting.mergedWith.map((mergedGroupId) => (
                                      <Badge
                                        key={mergedGroupId}
                                        variant="outline"
                                      >
                                        meeting {mergedGroupId}
                                      </Badge>
                                    ))}
                                  </>
                                )}
                            </CardTitle>
                            <CardDescription>
                              {formatDate(meeting.meetingStart)} -{" "}
                              {formatDate(meeting.meetingEnd)}
                            </CardDescription>
                          </div>
                          <div className="mb-4 text-end">
                            <h4 className="font-semibold mb-2">Devices:</h4>
                            <div className="flex flex-wrap gap-4 justify-end">
                              {Array.from(meeting.deviceNames).map(
                                (deviceName) => (
                                  <label
                                    key={deviceName}
                                    className="flex items-center space-x-2"
                                  >
                                    <Checkbox
                                      checked={meeting.selectedDevices.has(
                                        deviceName
                                      )}
                                      onCheckedChange={(checked) =>
                                        handleDeviceToggle(
                                          meeting.meetingGroup,
                                          deviceName,
                                          checked as boolean
                                        )
                                      }
                                    />
                                    <span className="text-sm">
                                      {deviceName}
                                    </span>
                                  </label>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4 relative">
                          <h4 className="font-semibold mb-2">transcription:</h4>
                          <Button
                            onClick={() =>
                              copyWithToast(
                                meeting.segments
                                  .filter((s) =>
                                    meeting.selectedDevices.has(s.deviceName)
                                  )
                                  .map((s) => {
                                    return `${formatTimestamp(s.timestamp)} [${
                                      s.speaker
                                        ? s.speaker.name
                                        : s.deviceType?.toLowerCase() ===
                                          "input"
                                        ? "you"
                                        : "others"
                                    }] ${s.transcription}`;
                                  })
                                  .join("\n"),
                                "transcription"
                              )
                            }
                            className="absolute top-0 right-0 p-1 h-6 w-6"
                            variant="outline"
                            size="icon"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm max-h-40 overflow-y-auto">
                            {meeting.segments
                              .filter((s) =>
                                meeting.selectedDevices.has(s.deviceName)
                              )
                              .sort(
                                (a, b) =>
                                  new Date(a.timestamp).getTime() -
                                  new Date(b.timestamp).getTime()
                              )
                              .map((s, i) => (
                                <React.Fragment key={i}>
                                  <span className="font-bold">
                                    {`${formatTimestamp(s.timestamp)} [${
                                      s.speaker
                                        ? s.speaker.name
                                        : s.deviceType?.toLowerCase() ===
                                          "input"
                                        ? "you"
                                        : "others"
                                    }]`}
                                  </span>{" "}
                                  {s.transcription}
                                  {"\n"}
                                </React.Fragment>
                              ))}
                          </pre>
                        </div>
                        <div className="relative">
                          <h4 className="font-semibold mb-2">summary:</h4>
                          {meeting.summary && (
                            <Button
                              onClick={() =>
                                copyWithToast(meeting.summary || "", "summary")
                              }
                              className="absolute top-0 right-0 p-1 h-6 w-6"
                              variant="outline"
                              size="icon"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          {meeting.summary ? (
                            <ReactMarkdown className="prose max-w-none">
                              {meeting.summary}
                            </ReactMarkdown>
                          ) : (
                            <div className="flex items-center mt-2">
                              <Input
                                type="text"
                                value={customSummaryPrompt}
                                onChange={(e) =>
                                  setCustomSummaryPrompt(e.target.value)
                                }
                                placeholder="custom summary prompt (optional)"
                                className="mr-2 p-2 border rounded text-sm flex-grow"
                              />
                              <Button
                                onClick={() => generateSummary(meeting)}
                                disabled={isSummarizing}
                              >
                                {isSummarizing ? (
                                  <FileText className="h-4 w-4 mr-2 animate-pulse" />
                                ) : (
                                  <PlusCircle className="h-4 w-4 mr-2" />
                                )}
                                {isSummarizing
                                  ? "generating summary..."
                                  : "generate summary"}
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    {index < sortedMeetings.length - 1 && (
                      <div className="flex justify-center my-2">
                        <Button
                          onClick={() => mergeMeetings(index)}
                          size="sm"
                          variant="outline"
                          className="text-xs"
                        >
                          <ChevronDown className="h-4 w-4 mr-2" />
                          merge with next meeting
                        </Button>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
