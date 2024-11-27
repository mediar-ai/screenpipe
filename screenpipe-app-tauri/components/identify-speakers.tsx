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
import {
  X,
  Copy,
  RefreshCw,
  Trash2,
  Users,
  FileText,
  PlusCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
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
import { Textarea } from "./ui/textarea";
import { keysToCamelCase } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ValueOf } from "next/dist/shared/lib/constants";
import { Checkbox } from "./ui/checkbox";
import { VideoComponent } from "./video";

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

interface AudioContent {
  chunkId: number;
  transcription: string;
  timestamp: string;
  filePath: string;
  offsetIndex: number;
  tags: string[];
  deviceName: string;
  deviceType: string;
}

interface AudioTranscription {
  type: "Audio";
  content: AudioContent;
}

interface UnnamedSpeakerResponseItem {
  id: string;
  name: string;
  metadata: string;
}

interface UnnamedSpeaker {
  id: string;
  name: string;
  metadata: {
    audioPaths: string[];
  };
}

export default function IdentifySpeakers() {
  const posthog = usePostHog();
  const { settings } = useSettings();
  const [unnamedSpeakers, setUnnamedSpeakers] = useState<UnnamedSpeaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const [showError, setShowError] = useState(false);
  const { copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [unnamedSpeakersPage, setUnnamedSpeakersPage] = useState(0);
  const [unnamedSpeakersLimit, setUnnamedSpeakersLimit] = useState(10);

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
      loadUnnamedSpeakers();
      posthog?.capture("identify_speakers_opened", {
        userId: settings.userId,
      });
    } else {
      posthog?.capture("identify_speakers_closed", {
        userId: settings.userId,
      });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isOpen, settings.userId, posthog]);

  useEffect(() => {
    setShowError(!!error);
  }, [error]);

  async function loadUnnamedSpeakers() {
    setLoading(true);
    try {
      await fetchUnnamedSpeakers(unnamedSpeakersPage);
    } catch (err) {
      setError("failed to load unnamed speakers");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUnnamedSpeakers(page: number) {
    console.log("fetching unnamed speakers...");
    setLoading(true);
    try {
      // Always fetch from the last 7x24 hours

      const response = await fetch(
        `http://localhost:3030/speakers/unnamed?limit=${unnamedSpeakersLimit}&offset=${
          unnamedSpeakersPage * unnamedSpeakersLimit
        }`
      );
      if (!response.ok) {
        throw new Error("failed to fetch unnamed speakers");
      }
      const result = await response.json();
      const updatedUnnamedSpeakers = result.map(
        (speaker: UnnamedSpeakerResponseItem) => ({
          ...speaker,
          metadata: JSON.parse(speaker.metadata),
        })
      );
      const camelCaseResult = updatedUnnamedSpeakers.map(
        keysToCamelCase<UnnamedSpeaker>
      );
      console.log("fetch result:", camelCaseResult);

      setUnnamedSpeakers(camelCaseResult);
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchUnnamedSpeakers(unnamedSpeakersPage);
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

  // const mergeMeetings = (index: number) => {
  //   posthog?.capture("meeting_merged");
  //   const updatedMeetings = [...meetings];
  //   const currentMeeting = updatedMeetings[index];
  //   const nextMeeting = updatedMeetings[index + 1];

  //   const mergedMeeting: Meeting = {
  //     ...currentMeeting,
  //     meetingEnd: new Date(
  //       Math.max(
  //         new Date(currentMeeting.meetingEnd).getTime(),
  //         new Date(nextMeeting.meetingEnd).getTime()
  //       )
  //     ).toISOString(),
  //     meetingStart: new Date(
  //       Math.min(
  //         new Date(currentMeeting.meetingStart).getTime(),
  //         new Date(nextMeeting.meetingStart).getTime()
  //       )
  //     ).toISOString(),
  //     fullTranscription: `${currentMeeting.fullTranscription}\n${nextMeeting.fullTranscription}`,
  //     mergedWith: [
  //       ...(currentMeeting.mergedWith || []),
  //       nextMeeting.meetingGroup,
  //       ...(nextMeeting.mergedWith || []),
  //     ],
  //     segments: [...currentMeeting.segments, ...nextMeeting.segments],
  //     selectedDevices: new Set([
  //       ...Array.from(currentMeeting.selectedDevices),
  //       ...Array.from(nextMeeting.selectedDevices),
  //     ]),
  //   };

  //   updatedMeetings[index] = mergedMeeting;
  //   updatedMeetings.splice(index + 1, 1); // remove the next meeting
  //   setMeetings(updatedMeetings);
  //   setItem("meetings", updatedMeetings);
  // };

  // const handleDeviceToggle = useCallback(
  //   (meetingGroup: number, deviceName: string, isChecked: boolean) => {
  //     setMeetings((prevMeetings) => {
  //       return prevMeetings.map((meeting) => {
  //         if (meeting.meetingGroup === meetingGroup) {
  //           const updatedSelectedDevices = new Set(meeting.selectedDevices);
  //           if (isChecked) {
  //             updatedSelectedDevices.add(deviceName);
  //           } else {
  //             updatedSelectedDevices.delete(deviceName);
  //           }
  //           return {
  //             ...meeting,
  //             selectedDevices: updatedSelectedDevices,
  //           };
  //         }
  //         return meeting;
  //       });
  //     });
  //   },
  //   []
  // );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" onClick={() => setIsOpen(true)}>
          <Calendar className="mr-2 h-4 w-4" />
          identify speakers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <DialogHeader className="py-4">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              Identify speakers based on recent audio clips
              <Badge variant="secondary" className="ml-2">
                experimental
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="mb-4 text-sm text-gray-600">
          this page helps you identify and manage speakers detected in your
          audio clips. you can listen to 3 clips of each speaker, assign them
          names, or mark them as hallucinations if they were incorrectly
          detected. you can also remove speakers from the database if needed.
          this helps improve the accuracy of speaker identification in your
          recordings.
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
              {unnamedSpeakers.length === 0 && !loading && !error && (
                <p className="text-center">no unnamed speakers found.</p>
              )}

              {unnamedSpeakers.map((speaker) => (
                <div key={speaker.id} className="p-4 border rounded mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      {/* <User className="h-4 w-4 text-gray-500" /> */}
                      <span className="font-medium">
                        Speaker ID: {speaker.id}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Handle delete speaker
                          posthog?.capture("speaker_deleted", {
                            speakerId: speaker.id,
                          });
                          toast({
                            title: "speaker deleted",
                            description:
                              "the speaker has been removed from the database",
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      const name = formData.get("speakerName") as string;

                      // Handle update speaker name
                      posthog?.capture("speaker_renamed", {
                        speakerId: speaker.id,
                        newName: name,
                      });
                      toast({
                        title: "speaker renamed",
                        description: "the speaker name has been updated",
                      });
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <Input
                        name="speakerName"
                        placeholder="Enter speaker name"
                        defaultValue={speaker.name}
                        className="max-w-xs"
                      />
                      <Button type="submit" size="sm">
                        Update Name
                      </Button>
                    </div>
                  </form>

                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">Audio Samples:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {speaker.metadata.audioPaths
                        .slice(0, 3)
                        .map((path, index) => (
                          <VideoComponent key={index} filePath={path} />
                        ))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
