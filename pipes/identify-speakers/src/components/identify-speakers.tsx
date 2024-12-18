"use client";

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
import {
  X,
  Fingerprint,
  Check,
  ChevronRight,
  Save,
  Ghost,
  Trash,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { getFileSize, keysToCamelCase } from "@/lib/utils";
import { VideoComponent } from "@/components/video";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

export interface MeetingSegment {
  timestamp: string;
  transcription: string;
  deviceName: string;
  deviceType: string;
  speaker: Speaker;
}

export type AudioSample = {
  path: string;
  transcript: string;
};

export interface Speaker {
  id: number;
  name: string;
  metadata?: {
    audioSamples: AudioSample[];
  };
}

interface UnnamedSpeaker {
  id: number;
  name: string;
  metadata: string;
}

export default function IdentifySpeakers({
  showIdentifySpeakers,
  setShowIdentifySpeakers,
  segments,
  className,
}: {
  showIdentifySpeakers: boolean;
  setShowIdentifySpeakers: (show: boolean) => void;
  segments?: MeetingSegment[];
  className?: string;
}) {
  const { settings } = useSettings();
  const [unnamedSpeakers, setUnnamedSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [showRemoveSpeakerConfirm, setShowRemoveSpeakerConfirm] =
    useState(false);
  const [showSpeakerNames, setShowSpeakerNames] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!isSearching && speakers.length > 0) {
      setShowSpeakerNames(true);
    }
  }, [isSearching, speakers]);

  useEffect(() => {
    if (speakerSearchTerm) {
      fetchSpeakers(speakerSearchTerm);
    }
  }, [speakerSearchTerm]);

  useEffect(() => {
    if (unnamedSpeakers.length > 0) {
      fetchSimilarSpeakers(unnamedSpeakers[currentSpeakerIndex].id);
    }
  }, [currentSpeakerIndex]);

  useEffect(() => {
    speakerIdentified &&
      setSimilarSpeakers(similarSpeakers.filter((s) => !s.name));
  }, [speakerIdentified]);

  useEffect(() => {
    if (segments) {
      setSegmentSpeakerIds(segments.map((segment) => segment.speaker.id));
    }
  }, [segments]);

  useEffect(() => {
    if (showIdentifySpeakers) {
      loadUnnamedSpeakers();
    } else {
      setSpeakerIdentified(false);
      setSelectedExistingSpeaker(null);
      setSpeakerSearchTerm("");
      setSpeakers([]);
      setSimilarSpeakers([]);
      setCurrentSpeakerIndex(0);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [showIdentifySpeakers]);

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
      const camelCaseResult: Speaker[] = updatedUnnamedSpeakers.map(
        keysToCamelCase<Speaker>
      );

      let similarSpeakersResult: Speaker[] = [];
      for (const speaker of camelCaseResult) {
        let longestAudioSample = speaker.metadata?.audioSamples[0];
        let longestAudioPathSize = -Infinity;
        for (const sample of speaker.metadata?.audioSamples || []) {
          const size = await getFileSize(sample.path);
          if (size > longestAudioPathSize) {
            longestAudioSample = sample;
            longestAudioPathSize = size;
          }
        }
        similarSpeakersResult.push({
          ...speaker,
          metadata: {
            audioSamples: [
              {
                path: longestAudioSample?.path || "",
                transcript: longestAudioSample?.transcript || "",
              },
            ],
          },
        });
      }

      setSimilarSpeakers(similarSpeakersResult);
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

      const results: Speaker[] = await camelCaseResult.map(
        async (speaker: Speaker) => {
          const durations: Map<string, number> = new Map();
          for (const sample of speaker.metadata?.audioSamples || []) {
            const size = await getFileSize(sample.path);
            durations.set(sample.path, size);
          }

          return {
            ...speaker,
            metadata: {
              ...speaker.metadata,
              audioSamples: speaker.metadata?.audioSamples.sort(
                (a: AudioSample, b: AudioSample) =>
                  (durations.get(b.path) || 0) - (durations.get(a.path) || 0)
              ),
            },
          };
        }
      );

      let sortedResults = await Promise.all(results);
      console.log("results", sortedResults);

      setUnnamedSpeakers(sortedResults);
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
        title: "speakers refreshed",
        description: "your speaker identification has been updated.",
      });
    } catch (error) {
      console.error("error refreshing meetings:", error);
      toast({
        title: "refresh failed",
        description:
          "failed to refresh speaker identification. please try again.",
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
      console.error("error updating speaker name:", error);
      toast({
        title: "error",
        description: "failed to update speaker name. please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveSpeaker = async () => {
    try {
      await fetch(`http://localhost:3030/speakers/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: unnamedSpeakers[currentSpeakerIndex].id,
        }),
      });

      handleRefresh();
    } catch (error) {
      console.error("error removing speaker:", error);
      toast({
        title: "error",
        description: "failed to remove speaker. please try again.",
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
          title: "speakers merged",
          description: "the speakers have been successfully merged",
        });

        if (selectedExistingSpeaker.name) {
          setSpeakerIdentified(true);
          setSpeakerSearchTerm(selectedExistingSpeaker.name);
        }

        setSimilarSpeakers(similarSpeakers.filter((s) => !s.name));

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
        console.error("error merging speakers:", error);
        toast({
          title: "error",
          description: "failed to merge speakers. please try again.",
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
      console.error("error ignoring speaker:", error);
      toast({
        title: "error",
        description: "failed to ignore speaker. please try again.",
        variant: "destructive",
      });
    }
  };

  // 4. Return null on first render to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  return segments ? (
    <Dialog open={showIdentifySpeakers} onOpenChange={setShowIdentifySpeakers}>
      <DialogTrigger asChild>
        <Button
          onClick={() => setShowIdentifySpeakers(true)}
          size="sm"
          className="text-xs bg-black text-white hover:bg-gray-800"
        >
          <Fingerprint className="mr-2 h-4 w-4" />
          identify speakers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <DialogHeader className="py-4">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              identify speakers based on recent audio clips
              <Badge variant="secondary" className="ml-2">
                experimental
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>
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
                <div className="mx-4">
                  <div className="p-4 border rounded h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">identify speaker</span>
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
                            onFocus={() => {
                              setShowSpeakerNames(true);
                            }}
                            onBlur={(e) => {
                              // Add a small delay to allow the click event to fire first
                              setTimeout(() => {
                                setShowSpeakerNames(false);
                              }, 200);
                            }}
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
                            <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {isSearching ? (
                                <div className="flex justify-center items-center p-4">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                                </div>
                              ) : (
                                showSpeakerNames && (
                                  <ul className="py-1">
                                    {speakers.map((speaker) => (
                                      <li
                                        key={speaker.id}
                                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer truncate"
                                        onClick={(e) => {
                                          setSpeakerSearchTerm(speaker.name);
                                          setSelectedExistingSpeaker(speaker);
                                          setShowMergeConfirm(true);
                                          setShowSpeakerNames(false);
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
                          disabled={!speakerSearchTerm || speakerIdentified}
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            setShowNameUpdateConfirm(true);
                          }}
                        >
                          <Save className="mr-2" />
                          update name
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={speakerIdentified}
                          onClick={async (e) => {
                            e.preventDefault();
                            setShowHallucinationConfirm(true);
                          }}
                        >
                          <Ghost className="mr-2" />
                          nobody is speaking
                        </Button>
                        <Button
                          type="button"
                          disabled={speakerIdentified}
                          variant="secondary"
                          onClick={async (e) => {
                            e.preventDefault();
                            setShowRemoveSpeakerConfirm(true);
                          }}
                        >
                          <Trash className="mr-2" />
                          remove speaker
                        </Button>
                      </div>
                    </form>

                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">
                        audio samples:
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {unnamedSpeakers[
                          currentSpeakerIndex
                        ].metadata?.audioSamples
                          .slice(0, 3)
                          .map((sample, index) => (
                            <VideoComponent
                              key={index}
                              filePath={sample.path}
                              customDescription={`transcript: ${sample.transcript}`}
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
                          next speaker
                          <ChevronRight className="ml-2" />
                        </Button>
                      </div>
                    )}
                    <div className="mt-8">
                      {similarSpeakers.length > 0 && (
                        <p className="text-sm text-gray-500 mb-4">
                          is this the same speaker?
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
                                {speaker.metadata?.audioSamples.map(
                                  (sample) => (
                                    <VideoComponent
                                      key={sample.path}
                                      filePath={sample.path}
                                      customDescription={`transcript: ${sample.transcript}`}
                                      className="max-w-[300px]"
                                    />
                                  )
                                )}
                                <Button
                                  size="default"
                                  variant="default"
                                  onClick={() => {
                                    setSelectedExistingSpeaker(speaker);
                                    setShowMergeConfirm(true);
                                  }}
                                >
                                  <Check className="mr-2" />
                                  same speaker
                                </Button>
                                <Button
                                  size="default"
                                  variant="outline"
                                  onClick={() => {
                                    const newSpeakers = similarSpeakers.filter(
                                      (s) => s.id !== speaker.id
                                    );
                                    setSimilarSpeakers(newSpeakers);
                                    setSimilarSpeakerIndex(
                                      Math.max(
                                        0,
                                        Math.min(
                                          similarSpeakerIndex,
                                          newSpeakers.length - 1
                                        )
                                      )
                                    );
                                  }}
                                >
                                  <X className="mr-2" />
                                  different speaker
                                </Button>
                                <Button
                                  size="default"
                                  className={
                                    similarSpeakers.length === 1 ? "hidden" : ""
                                  }
                                  variant="secondary"
                                  onClick={() => {
                                    setSimilarSpeakerIndex(
                                      (index + 1) % similarSpeakers.length
                                    );
                                  }}
                                >
                                  skip
                                  <ChevronRight className="ml-2" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
            <DialogTitle>confirm</DialogTitle>
            <DialogDescription>
              are you sure you nobody is speaking? this action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowHallucinationConfirm(false)}
            >
              cancel
            </Button>
            <Button
              variant="default"
              onClick={async () => {
                await handleMarkSpeakerAsHallucination();
                setShowHallucinationConfirm(false);
                toast({
                  title: "speaker ignored",
                  description:
                    "This speaker will be ignored in future processing",
                });
                setSpeakerIdentified(true);
              }}
            >
              confirm
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
            <DialogTitle>confirm name update</DialogTitle>
            <DialogDescription>
              are you sure you want to update this speaker&apos;s name to &quot;
              {speakerSearchTerm}
              &quot;?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="ghost"
              onClick={() => setShowNameUpdateConfirm(false)}
            >
              cancel
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
              confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>merge speakers</DialogTitle>
            {selectedExistingSpeaker?.name ? (
              <DialogDescription>
                do you want to merge this speaker with existing speaker
                {` "${selectedExistingSpeaker?.name}"`}? this will combine their
                audio samples and future recordings.
              </DialogDescription>
            ) : (
              <DialogDescription>
                do you want to merge this speaker? this will combine their audio
                samples and future recordings.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="ghost" onClick={() => setShowMergeConfirm(false)}>
              cancel
            </Button>
            {selectedExistingSpeaker?.name && (
              <Button
                variant="outline"
                onClick={() => {
                  setShowMergeConfirm(false);
                  // Still update the name without merging
                  handleUpdateSpeakerName(selectedExistingSpeaker?.name || "");
                  toast({
                    title: "speaker renamed",
                    description:
                      "the speaker name has been updated without merging",
                  });
                }}
              >
                just update name
              </Button>
            )}

            <Button onClick={handleMergeSpeakers}>merge speakers</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showRemoveSpeakerConfirm}
        onOpenChange={setShowRemoveSpeakerConfirm}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>confirm remove speaker</DialogTitle>
            <DialogDescription>
              are you sure you want to remove this speaker? this action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowRemoveSpeakerConfirm(false)}
            >
              cancel
            </Button>
            <Button
              onClick={async () => {
                await handleRemoveSpeaker();
                setShowRemoveSpeakerConfirm(false);
                toast({
                  title: "speaker removed",
                  description: "the speaker has been removed",
                });
              }}
            >
              confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>identify speakers</CardTitle>
        <CardDescription>
          identify speakers based on recent audio clips
          <Badge variant="secondary" className="ml-2">
            experimental
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
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
                <div className="mx-4">
                  <div className="p-4 border rounded h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">identify speaker</span>
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
                            onFocus={() => {
                              setShowSpeakerNames(true);
                            }}
                            onBlur={(e) => {
                              // Add a small delay to allow the click event to fire first
                              setTimeout(() => {
                                setShowSpeakerNames(false);
                              }, 200);
                            }}
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
                            <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {isSearching ? (
                                <div className="flex justify-center items-center p-4">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                                </div>
                              ) : (
                                showSpeakerNames && (
                                  <ul className="py-1">
                                    {speakers.map((speaker) => (
                                      <li
                                        key={speaker.id}
                                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer truncate"
                                        onClick={(e) => {
                                          setSpeakerSearchTerm(speaker.name);
                                          setSelectedExistingSpeaker(speaker);
                                          setShowMergeConfirm(true);
                                          setShowSpeakerNames(false);
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
                          disabled={!speakerSearchTerm || speakerIdentified}
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            setShowNameUpdateConfirm(true);
                          }}
                        >
                          <Save className="mr-2" />
                          update name
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={speakerIdentified}
                          onClick={async (e) => {
                            e.preventDefault();
                            setShowHallucinationConfirm(true);
                          }}
                        >
                          <Ghost className="mr-2" />
                          nobody is speaking
                        </Button>
                        <Button
                          type="button"
                          disabled={speakerIdentified}
                          variant="secondary"
                          onClick={async (e) => {
                            e.preventDefault();
                            setShowRemoveSpeakerConfirm(true);
                          }}
                        >
                          <Trash className="mr-2" />
                          remove speaker
                        </Button>
                      </div>
                    </form>

                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">
                        audio samples:
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {unnamedSpeakers[
                          currentSpeakerIndex
                        ].metadata?.audioSamples
                          .slice(0, 3)
                          .map((sample, index) => (
                            <VideoComponent
                              key={index}
                              filePath={sample.path}
                              customDescription={`transcript: ${sample.transcript}`}
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
                          next speaker
                          <ChevronRight className="ml-2" />
                        </Button>
                      </div>
                    )}
                    <div className="mt-8">
                      {similarSpeakers.length > 0 && (
                        <p className="text-sm text-gray-500 mb-4">
                          is this the same speaker?
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
                                {speaker.metadata?.audioSamples.map(
                                  (sample) => (
                                    <VideoComponent
                                      key={sample.path}
                                      filePath={sample.path}
                                      customDescription={`transcript: ${sample.transcript}`}
                                      className="max-w-[300px]"
                                    />
                                  )
                                )}
                                <Button
                                  size="default"
                                  variant="default"
                                  onClick={() => {
                                    setSelectedExistingSpeaker(speaker);
                                    setShowMergeConfirm(true);
                                  }}
                                >
                                  <Check className="mr-2" />
                                  same speaker
                                </Button>
                                <Button
                                  size="default"
                                  variant="outline"
                                  onClick={() => {
                                    const newSpeakers = similarSpeakers.filter(
                                      (s) => s.id !== speaker.id
                                    );
                                    setSimilarSpeakers(newSpeakers);
                                    setSimilarSpeakerIndex(
                                      Math.max(
                                        0,
                                        Math.min(
                                          similarSpeakerIndex,
                                          newSpeakers.length - 1
                                        )
                                      )
                                    );
                                  }}
                                >
                                  <X className="mr-2" />
                                  different speaker
                                </Button>
                                <Button
                                  size="default"
                                  className={
                                    similarSpeakers.length === 1 ? "hidden" : ""
                                  }
                                  variant="secondary"
                                  onClick={() => {
                                    setSimilarSpeakerIndex(
                                      (index + 1) % similarSpeakers.length
                                    );
                                  }}
                                >
                                  skip
                                  <ChevronRight className="ml-2" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <Dialog
        open={showHallucinationConfirm}
        onOpenChange={setShowHallucinationConfirm}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>confirm</DialogTitle>
            <DialogDescription>
              are you sure you nobody is speaking? this action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowHallucinationConfirm(false)}
            >
              cancel
            </Button>
            <Button
              variant="default"
              onClick={async () => {
                await handleMarkSpeakerAsHallucination();
                setShowHallucinationConfirm(false);
                toast({
                  title: "speaker ignored",
                  description:
                    "This speaker will be ignored in future processing",
                });
                setSpeakerIdentified(true);
              }}
            >
              confirm
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
            <DialogTitle>confirm name update</DialogTitle>
            <DialogDescription>
              are you sure you want to update this speaker&apos;s name to &quot;
              {speakerSearchTerm}
              &quot;?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="ghost"
              onClick={() => setShowNameUpdateConfirm(false)}
            >
              cancel
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
              confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>merge speakers</DialogTitle>
            {selectedExistingSpeaker?.name ? (
              <DialogDescription>
                do you want to merge this speaker with existing speaker
                {` "${selectedExistingSpeaker?.name}"`}? this will combine their
                audio samples and future recordings.
              </DialogDescription>
            ) : (
              <DialogDescription>
                do you want to merge this speaker? this will combine their audio
                samples and future recordings.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="ghost" onClick={() => setShowMergeConfirm(false)}>
              cancel
            </Button>
            {selectedExistingSpeaker?.name && (
              <Button
                variant="outline"
                onClick={() => {
                  setShowMergeConfirm(false);
                  // Still update the name without merging
                  handleUpdateSpeakerName(selectedExistingSpeaker?.name || "");
                  toast({
                    title: "speaker renamed",
                    description:
                      "the speaker name has been updated without merging",
                  });
                }}
              >
                just update name
              </Button>
            )}

            <Button onClick={handleMergeSpeakers}>merge speakers</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showRemoveSpeakerConfirm}
        onOpenChange={setShowRemoveSpeakerConfirm}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>confirm remove speaker</DialogTitle>
            <DialogDescription>
              are you sure you want to remove this speaker? this action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowRemoveSpeakerConfirm(false)}
            >
              cancel
            </Button>
            <Button
              onClick={async () => {
                await handleRemoveSpeaker();
                setShowRemoveSpeakerConfirm(false);
                toast({
                  title: "speaker removed",
                  description: "the speaker has been removed",
                });
              }}
            >
              confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
