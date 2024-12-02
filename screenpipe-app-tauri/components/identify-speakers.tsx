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
  Fingerprint,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
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
import { useDebounce } from "@/lib/hooks/use-debounce";

interface UnnamedSpeakerResponseItem {
  id: string;
  name: string;
  metadata: string;
}

interface UnnamedSpeaker {
  id: number;
  name: string;
  metadata: {
    audioPaths: string[];
  };
}

interface SpeakerSearchResult {
  id: number;
  name: string;
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
  const [currentSpeakerIndex, setCurrentSpeakerIndex] = useState(0);
  const [showHallucinationConfirm, setShowHallucinationConfirm] =
    useState(false);
  const [showNameUpdateConfirm, setShowNameUpdateConfirm] = useState(false);
  const [pendingNameUpdate, setPendingNameUpdate] = useState<string>("");
  const [speakerSearchTerm, setSpeakerSearchTerm] = useState<string>("");
  const [speakers, setSpeakers] = useState<UnnamedSpeaker[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [selectedExistingSpeaker, setSelectedExistingSpeaker] =
    useState<SpeakerSearchResult | null>(null);
  // const debouncedSpeakerSearchTerm = useDebounce(speakerSearchTerm, 100);

  useEffect(() => {
    if (speakerSearchTerm) {
      fetchSpeakers(speakerSearchTerm);
    }
  }, [speakerSearchTerm]);

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

  useEffect(() => {
    if (showError) {
      setTimeout(() => {
        setShowError(false);
      }, 5000);
    }
  }, [showError]);

  async function loadUnnamedSpeakers() {
    setLoading(true);
    try {
      await fetchUnnamedSpeakers();
    } catch (err) {
      setError("failed to load unnamed speakers");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSpeakers(searchTerm: string) {
    console.log("fetching speakers...");
    setIsSearching(true);

    try {
      const response = await fetch(
        `http://localhost:3030/speakers/search?name=${searchTerm}`
      );
      if (!response.ok) {
        throw new Error("failed to fetch speakers");
      }
      const result = await response.json();
      setSpeakers(result);
    } catch (error) {
      console.error("error fetching speakers:", error);
      setError("failed to fetch speakers");
    } finally {
      setIsSearching(false);
    }
  }

  async function fetchUnnamedSpeakers() {
    setLoading(true);
    try {
      // Always fetch from the last 7x24 hours

      const response = await fetch(
        `http://localhost:3030/speakers/unnamed?limit=1&offset=0`
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

      setUnnamedSpeakers(camelCaseResult);
    } catch (err) {
      setError(
        "some trouble fetching new meetings. please check health status."
      );
      console.error("fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleRefresh = async () => {
    setSpeakers([]);
    setIsRefreshing(true);
    try {
      await fetchUnnamedSpeakers();
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

  const handleUpdateSpeakerName = async (newName: string) => {
    // use the endpoint /speakers/update to update the name
    try {
      await fetch(`http://localhost:3030/speakers/update`, {
        method: "POST",
        body: JSON.stringify({
          id: unnamedSpeakers[currentSpeakerIndex].id,
          name: newName,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      setSpeakerSearchTerm("");
      handleRefresh();
    } catch (error) {
      console.error("Error updating speaker name:", error);
      toast({
        title: "Error",
        description: "Failed to update speaker name. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleMergeSpeakers = async () => {
    if (selectedExistingSpeaker) {
      try {
        // Add API call to merge speakers
        await fetch(`http://localhost:3030/speakers/merge`, {
          method: "POST",
          body: JSON.stringify({
            speaker_to_merge_id: unnamedSpeakers[currentSpeakerIndex].id,
            speaker_to_keep_id: selectedExistingSpeaker.id,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        toast({
          title: "Speakers merged",
          description: "The speakers have been successfully merged",
        });

        // Refresh the unnamed speakers list
        await handleRefresh();
      } catch (error) {
        console.error("Error merging speakers:", error);
        toast({
          title: "Error",
          description: "Failed to merge speakers. Please try again.",
          variant: "destructive",
        });
      }
    }
    setSpeakerSearchTerm("");
    setShowMergeConfirm(false);
  };

  const handleMarkSpeakerAsHallucination = async () => {
    // use the endpoint /speakers/hallucination to mark the speaker as hallucination
    try {
      await fetch(`http://localhost:3030/speakers/hallucination`, {
        method: "POST",
        body: JSON.stringify({
          speaker_id: unnamedSpeakers[currentSpeakerIndex].id,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("Error marking speaker as hallucination:", error);
      toast({
        title: "Error",
        description:
          "Failed to mark speaker as hallucination. Please try again.",
        variant: "destructive",
      });
    }

    setSpeakerSearchTerm("");
    handleRefresh();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-[20px] px-0 py-0"
          onClick={() => setIsOpen(true)}
        >
          <Fingerprint className="mr-2 h-4 w-4" />
          <span>identify speakers</span>
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
          audio clips. you can listen to up to 3 clips of each speaker, assign
          them names, or mark them as hallucinations if they were incorrectly
          detected. this helps improve the accuracy of speaker identification in
          your recordings.
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

              {unnamedSpeakers.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex-1 mx-4">
                    <div className="p-4 border rounded">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">
                            Speaker {currentSpeakerIndex + 1} of{" "}
                            {unnamedSpeakers.length}
                          </span>
                        </div>
                      </div>
                      <form
                        className="space-y-4"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          const newName = formData.get("speakerName") as string;
                          setPendingNameUpdate(newName);
                          setShowNameUpdateConfirm(true);
                          await fetchSpeakers(newName);
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="relative flex-1 max-w-xs">
                            <Input
                              value={speakerSearchTerm}
                              name="speakerName"
                              onChange={(e) => {
                                setSpeakers(
                                  speakers.filter((speaker) =>
                                    speaker.name
                                      .toLowerCase()
                                      .includes(e.target.value.toLowerCase())
                                  )
                                );

                                setSpeakerSearchTerm(e.target.value);
                              }}
                              placeholder="Enter speaker name"
                              className="w-full"
                            />
                            {speakerSearchTerm && (
                              <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
                                {isSearching ? (
                                  <div className="flex justify-center items-center p-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                                  </div>
                                ) : (
                                  speakers.length > 0 && (
                                    <ul className="py-1">
                                      {speakers.map((speaker) => (
                                        <li
                                          key={speaker.id}
                                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                          onClick={() => {
                                            setSpeakerSearchTerm(speaker.name);
                                            setSelectedExistingSpeaker(speaker);
                                            setShowMergeConfirm(true);
                                          }}
                                        >
                                          {speaker.name}
                                        </li>
                                      ))}
                                    </ul>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                          <Button type="submit" size="sm">
                            Update Name
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={async () => {
                              setShowHallucinationConfirm(true);
                            }}
                          >
                            Mark as Hallucination
                          </Button>
                        </div>
                      </form>

                      <div className="mt-4">
                        <p className="text-sm text-gray-500 mb-2">
                          Audio Samples:
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {unnamedSpeakers[
                            currentSpeakerIndex
                          ].metadata.audioPaths
                            .slice(0, 3)
                            .map((path, index) => (
                              <VideoComponent key={index} filePath={path} />
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
      <Dialog
        open={showHallucinationConfirm}
        onOpenChange={setShowHallucinationConfirm}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Hallucination</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this speaker as a hallucination?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowHallucinationConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await handleMarkSpeakerAsHallucination();
                setShowHallucinationConfirm(false);
                toast({
                  title: "Speaker marked as hallucination",
                  description:
                    "This speaker will be ignored in future processing",
                });
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showNameUpdateConfirm}
        onOpenChange={setShowNameUpdateConfirm}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Name Update</DialogTitle>
            <DialogDescription>
              Are you sure you want to update this speaker&apos;s name to &quot;
              {pendingNameUpdate}
              &quot;?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowNameUpdateConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleUpdateSpeakerName(pendingNameUpdate);
                setShowNameUpdateConfirm(false);
                toast({
                  title: "speaker renamed",
                  description: "the speaker name has been updated",
                });
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Merge Speakers</DialogTitle>
            <DialogDescription>
              Do you want to merge this speaker with existing speaker &quot;
              {selectedExistingSpeaker?.name}&quot;? This will combine their
              audio samples and future recordings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMergeConfirm(false);
                // Still update the name without merging
                handleUpdateSpeakerName(selectedExistingSpeaker?.name || "");
                toast({
                  title: "Speaker renamed",
                  description:
                    "The speaker name has been updated without merging",
                });
              }}
            >
              Just Update Name
            </Button>
            <Button onClick={handleMergeSpeakers}>Merge Speakers</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
