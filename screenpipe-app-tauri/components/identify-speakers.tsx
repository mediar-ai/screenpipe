import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "./ui/use-toast";
import { X, Fingerprint, Check } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { keysToCamelCase } from "@/lib/utils";
import { VideoComponent } from "./video";
import { MeetingSegment, Speaker } from "@/lib/types";

interface UnnamedSpeaker {
  id: number;
  name: string;
  metadata: string;
}

export default function IdentifySpeakers({
  segments,
}: {
  segments?: MeetingSegment[];
}) {
  const posthog = usePostHog();
  const { settings } = useSettings();
  const [unnamedSpeakers, setUnnamedSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const [showError, setShowError] = useState(false);
  const [currentSpeakerIndex, setCurrentSpeakerIndex] = useState(0);
  const [showHallucinationConfirm, setShowHallucinationConfirm] =
    useState(false);
  const [showNameUpdateConfirm, setShowNameUpdateConfirm] = useState(false);
  const [speakerSearchTerm, setSpeakerSearchTerm] = useState<string>("");
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [selectedExistingSpeaker, setSelectedExistingSpeaker] =
    useState<Speaker | null>(null);
  const [segmentSpeakerIds, setSegmentSpeakerIds] = useState<number[]>([]);
  const [similarSpeakers, setSimilarSpeakers] = useState<Speaker[]>([]);
  const [isFetchingSimilarSpeakers, setIsFetchingSimilarSpeakers] =
    useState(false);
  const [speakerIdentified, setSpeakerIdentified] = useState(false);
  const [similarSpeakerIndex, setSimilarSpeakerIndex] = useState(0);

  useEffect(() => {
    if (speakerSearchTerm) {
      fetchSpeakers(speakerSearchTerm);
    }
  }, [speakerSearchTerm]);

  useEffect(() => {
    if (unnamedSpeakers.length > 0) {
      fetchSimilarSpeakers(unnamedSpeakers[currentSpeakerIndex].id);
    }
  }, [unnamedSpeakers, currentSpeakerIndex]);

  useEffect(() => {
    if (posthog) {
      posthog.identify(settings.userId);
      posthog.people.set({
        userId: settings.userId,
      });
    }
  }, [posthog, settings.userId]);

  useEffect(() => {
    if (segments) {
      setSegmentSpeakerIds(segments.map((segment) => segment.speaker.id));
    }
  }, [segments]);

  useEffect(() => {
    if (isOpen) {
      loadUnnamedSpeakers();
      posthog?.capture("identify_speakers_opened", {
        userId: settings.userId,
        source: segments ? "meeting_history" : "menu",
      });
    } else {
      posthog?.capture("identify_speakers_closed", {
        userId: settings.userId,
        source: segments ? "meeting_history" : "menu",
      });
      setSpeakerIdentified(false);
      setSelectedExistingSpeaker(null);
      setSpeakerSearchTerm("");
      setSpeakers([]);
      setSimilarSpeakers([]);
      setCurrentSpeakerIndex(0);
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

  async function fetchSimilarSpeakers(speakerId: number) {
    setIsFetchingSimilarSpeakers(true);

    console.log("fetching similar speakers for", speakerId);
    try {
      const response = await fetch(
        `http://localhost:3030/speakers/similar?speaker_id=${speakerId}&limit=5`
      );
      if (!response.ok) {
        throw new Error("failed to fetch similar speakers");
      }
      const result = await response.json();

      const updatedUnnamedSpeakers = result.map((speaker: UnnamedSpeaker) => ({
        ...speaker,
        metadata: speaker.metadata ? JSON.parse(speaker.metadata) : undefined,
      }));
      const camelCaseResult = updatedUnnamedSpeakers.map(
        keysToCamelCase<Speaker>
      );

      setSimilarSpeakers(camelCaseResult);
    } catch (error) {
      console.error("error fetching similar speakers:", error);
      setError("failed to fetch similar speakers");
    } finally {
      setIsFetchingSimilarSpeakers(false);
    }
  }

  async function fetchUnnamedSpeakers() {
    setLoading(true);
    try {
      // Always fetch from the last 7x24 hours

      const response = await fetch(
        `http://localhost:3030/speakers/unnamed?limit=1&offset=0${
          segmentSpeakerIds.length > 0
            ? `&speaker_ids=${segmentSpeakerIds.join(",")}`
            : ""
        }`
      );
      if (!response.ok) {
        throw new Error("failed to fetch unnamed speakers");
      }
      const result = await response.json();
      const updatedUnnamedSpeakers = result.map((speaker: UnnamedSpeaker) => ({
        ...speaker,
        metadata: speaker.metadata ? JSON.parse(speaker.metadata) : undefined,
      }));
      const camelCaseResult = updatedUnnamedSpeakers.map(
        keysToCamelCase<Speaker>
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
      setSpeakerSearchTerm("");
      setSpeakerIdentified(false);
      setSelectedExistingSpeaker(null);
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
      setSpeakerIdentified(true);
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

        if (selectedExistingSpeaker.name) {
          setSpeakerIdentified(true);
          setSpeakerSearchTerm(selectedExistingSpeaker.name);
        }

        setSimilarSpeakers(
          similarSpeakers.filter(
            (s) => s.id !== unnamedSpeakers[currentSpeakerIndex].id
          )
        );

        setUnnamedSpeakers(
          unnamedSpeakers.map((s) => ({
            ...s,
            id:
              s.id === unnamedSpeakers[currentSpeakerIndex].id
                ? selectedExistingSpeaker.id
                : s.id,
          }))
        );
      } catch (error) {
        console.error("Error merging speakers:", error);
        toast({
          title: "Error",
          description: "Failed to merge speakers. Please try again.",
          variant: "destructive",
        });
      }
    }
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
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {!segments ? (
          <Button
            variant="ghost"
            className="h-[20px] px-0 py-0"
            onClick={() => setIsOpen(true)}
          >
            <Fingerprint className="mr-2 h-4 w-4" />
            <span>identify speakers</span>
          </Button>
        ) : (
          <Button
            onClick={() => setIsOpen(true)}
            size="sm"
            className="text-xs bg-black text-white hover:bg-gray-800"
          >
            identify speakers
          </Button>
        )}
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
          detected. you can also tell us if another speaker is the same by
          listening to the other recordings. this helps improve the accuracy of
          speaker identification in your recordings.
        </DialogDescription>
        <div className="flex-grow overflow-auto min-h-[600px] flex flex-col">
          {loading ? (
            <div className="space-y-6 min-h-[600px]">
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
            <div className="min-h-[600px] flex flex-col">
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
                <div className="flex-1 flex items-start justify-between">
                  <div className="flex-1 mx-4">
                    <div className="p-4 border rounded h-full">
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
                          setShowNameUpdateConfirm(true);
                          await fetchSpeakers(speakerSearchTerm);
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="relative flex-1 max-w-xs">
                            <Input
                              value={speakerSearchTerm}
                              name="speakerName"
                              onChange={(e) => {
                                const newValue = e.target.value;
                                setSpeakerSearchTerm(newValue);
                                // Only filter existing speakers if we have any
                                if (speakers.length > 0) {
                                  setSpeakers(
                                    speakers.filter((speaker) =>
                                      speaker.name
                                        .toLowerCase()
                                        .includes(newValue.toLowerCase())
                                    )
                                  );
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === " " && !segments) {
                                  setSpeakerSearchTerm(speakerSearchTerm + " ");
                                }
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
                          <Button
                            type="submit"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              setShowNameUpdateConfirm(true);
                            }}
                          >
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
                          ].metadata?.audioPaths
                            .slice(0, 3)
                            .map((path, index) => (
                              <VideoComponent
                                key={index}
                                filePath={path}
                                customDescription={`${index + 1} of ${
                                  unnamedSpeakers[currentSpeakerIndex].metadata
                                    ?.audioPaths.length
                                }`}
                              />
                            ))}
                        </div>
                      </div>
                      {speakerIdentified && (
                        <div className="mt-4 flex justify-end">
                          <Button
                            onClick={() => {
                              handleRefresh();
                            }}
                          >
                            Next Speaker
                          </Button>
                        </div>
                      )}
                      <div className="mt-8">
                        {similarSpeakers.length > 0 && (
                          <p className="text-sm text-gray-500 mb-4">
                            Is this the same speaker?
                          </p>
                        )}
                        {isFetchingSimilarSpeakers ? (
                          <div className="flex justify-center items-center p-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                          </div>
                        ) : (
                          <div>
                            {similarSpeakers.map((speaker, index) => {
                              if (similarSpeakerIndex !== index) {
                                return null;
                              }
                              return (
                                <div
                                  className="flex space-x-2 items-center"
                                  key={speaker.id}
                                >
                                  <span>{speaker.name || ""}</span>
                                  {speaker.metadata?.audioPaths.map((path) => (
                                    <VideoComponent
                                      key={path}
                                      filePath={path}
                                      customDescription={` `}
                                      className="max-w-[300px]"
                                    />
                                  ))}
                                  <Button
                                    size="default"
                                    variant="default"
                                    onClick={() => {
                                      setSelectedExistingSpeaker(speaker);
                                      setShowMergeConfirm(true);
                                    }}
                                  >
                                    Same Speaker
                                  </Button>
                                  <Button
                                    size="default"
                                    variant="destructive"
                                    onClick={() => {
                                      setSimilarSpeakers(
                                        similarSpeakers.filter(
                                          (s) => s.id !== speaker.id
                                        )
                                      );
                                    }}
                                  >
                                    Different Speaker
                                  </Button>
                                  <Button
                                    size="default"
                                    className={
                                      similarSpeakers.length === 1
                                        ? "hidden"
                                        : ""
                                    }
                                    variant="secondary"
                                    onClick={() => {
                                      setSimilarSpeakerIndex(
                                        (index + 1) % similarSpeakers.length
                                      );
                                    }}
                                  >
                                    Skip
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
              {speakerSearchTerm}
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
                await handleUpdateSpeakerName(speakerSearchTerm);
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
            {selectedExistingSpeaker?.name && (
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
            )}
            <Button onClick={handleMergeSpeakers}>Merge Speakers</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
