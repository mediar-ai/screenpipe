"use strict";
"use client";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = IdentifySpeakers;
const react_1 = require("react");
const button_1 = require("@/components/ui/button");
const dialog_1 = require("@/components/ui/dialog");
const use_toast_1 = require("./ui/use-toast");
const lucide_react_1 = require("lucide-react");
const badge_1 = require("./ui/badge");
const input_1 = require("./ui/input");
const utils_1 = require("@/lib/utils");
const video_actions_1 = require("@/lib/actions/video-actions");
const video_1 = require("@/components/video");
const card_1 = require("./ui/card");
const browser_1 = require("@screenpipe/browser");
function IdentifySpeakers({ showIdentifySpeakers, setShowIdentifySpeakers, segments, }) {
    var _a, _b;
    const [unnamedSpeakers, setUnnamedSpeakers] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const { toast } = (0, use_toast_1.useToast)();
    const [showError, setShowError] = (0, react_1.useState)(false);
    const [currentSpeakerIndex, setCurrentSpeakerIndex] = (0, react_1.useState)(0);
    const [showHallucinationConfirm, setShowHallucinationConfirm] = (0, react_1.useState)(false);
    const [showNameUpdateConfirm, setShowNameUpdateConfirm] = (0, react_1.useState)(false);
    const [speakerSearchTerm, setSpeakerSearchTerm] = (0, react_1.useState)("");
    const [speakers, setSpeakers] = (0, react_1.useState)([]);
    const [isSearching, setIsSearching] = (0, react_1.useState)(false);
    const [showMergeConfirm, setShowMergeConfirm] = (0, react_1.useState)(false);
    const [selectedExistingSpeaker, setSelectedExistingSpeaker] = (0, react_1.useState)(null);
    const [segmentSpeakerIds, setSegmentSpeakerIds] = (0, react_1.useState)([]);
    const [similarSpeakers, setSimilarSpeakers] = (0, react_1.useState)([]);
    const [isFetchingSimilarSpeakers, setIsFetchingSimilarSpeakers] = (0, react_1.useState)(false);
    const [speakerIdentified, setSpeakerIdentified] = (0, react_1.useState)(false);
    const [similarSpeakerIndex, setSimilarSpeakerIndex] = (0, react_1.useState)(0);
    const [showRemoveSpeakerConfirm, setShowRemoveSpeakerConfirm] = (0, react_1.useState)(false);
    const [showSpeakerNames, setShowSpeakerNames] = (0, react_1.useState)(false);
    const [mounted, setMounted] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setMounted(true);
    }, []);
    (0, react_1.useEffect)(() => {
        if (!isSearching && speakers.length > 0) {
            setShowSpeakerNames(true);
        }
    }, [isSearching, speakers]);
    (0, react_1.useEffect)(() => {
        if (speakerSearchTerm) {
            fetchSpeakers(speakerSearchTerm);
        }
    }, [speakerSearchTerm]);
    (0, react_1.useEffect)(() => {
        if (unnamedSpeakers.length > 0) {
            fetchSimilarSpeakers(unnamedSpeakers[currentSpeakerIndex].id);
        }
    }, [currentSpeakerIndex]);
    (0, react_1.useEffect)(() => {
        speakerIdentified &&
            setSimilarSpeakers(similarSpeakers.filter((s) => !s.name));
    }, [speakerIdentified]);
    (0, react_1.useEffect)(() => {
        if (segments) {
            setSegmentSpeakerIds(segments.map((segment) => segment.speaker.id));
        }
    }, [segments]);
    (0, react_1.useEffect)(() => {
        if (showIdentifySpeakers) {
            loadUnnamedSpeakers();
        }
        else {
            setSpeakerIdentified(false);
            setSelectedExistingSpeaker(null);
            setSpeakerSearchTerm("");
            setSpeakers([]);
            setSimilarSpeakers([]);
            setCurrentSpeakerIndex(0);
        }
        /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [showIdentifySpeakers]);
    (0, react_1.useEffect)(() => {
        setShowError(!!error);
    }, [error]);
    (0, react_1.useEffect)(() => {
        if (showError) {
            setTimeout(() => {
                setShowError(false);
            }, 5000);
        }
    }, [showError]);
    function loadUnnamedSpeakers() {
        return __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            try {
                yield fetchUnnamedSpeakers();
            }
            catch (err) {
                setError("failed to load unnamed speakers");
            }
            finally {
                setLoading(false);
            }
        });
    }
    function fetchSpeakers(searchTerm) {
        return __awaiter(this, void 0, void 0, function* () {
            setIsSearching(true);
            try {
                const response = yield fetch(`http://localhost:3030/speakers/search?name=${searchTerm}`);
                if (!response.ok) {
                    throw new Error("failed to fetch speakers");
                }
                const result = yield response.json();
                setSpeakers(result);
            }
            catch (error) {
                console.error("error fetching speakers:", error);
                setError("failed to fetch speakers");
            }
            finally {
                setIsSearching(false);
            }
        });
    }
    function fetchSimilarSpeakers(speakerId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            setIsFetchingSimilarSpeakers(true);
            console.log("fetching similar speakers for", speakerId);
            try {
                const response = yield fetch(`http://localhost:3030/speakers/similar?speaker_id=${speakerId}&limit=5`);
                if (!response.ok) {
                    throw new Error("failed to fetch similar speakers");
                }
                const result = yield response.json();
                const updatedUnnamedSpeakers = result.map((speaker) => (Object.assign(Object.assign({}, speaker), { metadata: speaker.metadata ? JSON.parse(speaker.metadata) : undefined })));
                const camelCaseResult = updatedUnnamedSpeakers.map((utils_1.keysToCamelCase));
                let similarSpeakersResult = [];
                for (const speaker of camelCaseResult) {
                    let longestAudioSample = (_a = speaker.metadata) === null || _a === void 0 ? void 0 : _a.audioSamples[0];
                    let longestAudioPathSize = -Infinity;
                    for (const sample of ((_b = speaker.metadata) === null || _b === void 0 ? void 0 : _b.audioSamples) || []) {
                        const size = yield (0, video_actions_1.getFileSize)(sample.path);
                        if (size > longestAudioPathSize) {
                            longestAudioSample = sample;
                            longestAudioPathSize = size;
                        }
                    }
                    similarSpeakersResult.push(Object.assign(Object.assign({}, speaker), { metadata: {
                            audioSamples: [
                                {
                                    path: (longestAudioSample === null || longestAudioSample === void 0 ? void 0 : longestAudioSample.path) || "",
                                    transcript: (longestAudioSample === null || longestAudioSample === void 0 ? void 0 : longestAudioSample.transcript) || "",
                                },
                            ],
                        } }));
                }
                setSimilarSpeakers(similarSpeakersResult);
            }
            catch (error) {
                console.error("error fetching similar speakers:", error);
                setError("failed to fetch similar speakers");
            }
            finally {
                setIsFetchingSimilarSpeakers(false);
            }
        });
    }
    function fetchUnnamedSpeakers() {
        return __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            try {
                // Always fetch from the last 7x24 hours
                const response = yield fetch(`http://localhost:3030/speakers/unnamed?limit=1&offset=0${segmentSpeakerIds.length > 0
                    ? `&speaker_ids=${segmentSpeakerIds.join(",")}`
                    : ""}`);
                if (!response.ok) {
                    throw new Error("failed to fetch unnamed speakers");
                }
                const result = yield response.json();
                const updatedUnnamedSpeakers = result.map((speaker) => (Object.assign(Object.assign({}, speaker), { metadata: speaker.metadata ? JSON.parse(speaker.metadata) : undefined })));
                const camelCaseResult = updatedUnnamedSpeakers.map((utils_1.keysToCamelCase));
                const results = yield camelCaseResult.map((speaker) => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b;
                    const durations = new Map();
                    for (const sample of ((_a = speaker.metadata) === null || _a === void 0 ? void 0 : _a.audioSamples) || []) {
                        const size = yield (0, video_actions_1.getFileSize)(sample.path);
                        durations.set(sample.path, size);
                    }
                    return Object.assign(Object.assign({}, speaker), { metadata: Object.assign(Object.assign({}, speaker.metadata), { audioSamples: (_b = speaker.metadata) === null || _b === void 0 ? void 0 : _b.audioSamples.sort((a, b) => (durations.get(b.path) || 0) - (durations.get(a.path) || 0)) }) });
                }));
                let sortedResults = yield Promise.all(results);
                console.log("results", sortedResults);
                setUnnamedSpeakers(sortedResults);
            }
            catch (err) {
                setError("some trouble fetching new meetings. please check health status.");
                console.error("fetch error:", err);
            }
            finally {
                setLoading(false);
            }
        });
    }
    const handleRefresh = () => __awaiter(this, void 0, void 0, function* () {
        setSpeakers([]);
        try {
            yield fetchUnnamedSpeakers();
            toast({
                title: "speakers refreshed",
                description: "your speaker identification has been updated.",
            });
        }
        catch (error) {
            console.error("error refreshing meetings:", error);
            toast({
                title: "refresh failed",
                description: "failed to refresh speaker identification. please try again.",
                variant: "destructive",
            });
        }
        finally {
            setSpeakerSearchTerm("");
            setSpeakerIdentified(false);
            setSelectedExistingSpeaker(null);
        }
    });
    const handleUpdateSpeakerName = (newName) => __awaiter(this, void 0, void 0, function* () {
        browser_1.pipe.captureMainFeatureEvent("identify-speakers", {
            action: "update-speaker-name",
            newName: newName,
        });
        // use the endpoint /speakers/update to update the name
        try {
            yield fetch(`http://localhost:3030/speakers/update`, {
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
        }
        catch (error) {
            console.error("error updating speaker name:", error);
            toast({
                title: "error",
                description: "failed to update speaker name. please try again.",
                variant: "destructive",
            });
        }
    });
    const handleRemoveSpeaker = () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield fetch(`http://localhost:3030/speakers/delete`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    id: unnamedSpeakers[currentSpeakerIndex].id,
                }),
            });
            handleRefresh();
        }
        catch (error) {
            console.error("error removing speaker:", error);
            toast({
                title: "error",
                description: "failed to remove speaker. please try again.",
                variant: "destructive",
            });
        }
    });
    const handleMergeSpeakers = () => __awaiter(this, void 0, void 0, function* () {
        if (selectedExistingSpeaker) {
            try {
                // Add API call to merge speakers
                yield fetch(`http://localhost:3030/speakers/merge`, {
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
                setUnnamedSpeakers(unnamedSpeakers.map((s) => (Object.assign(Object.assign({}, s), { id: s.id === unnamedSpeakers[currentSpeakerIndex].id
                        ? selectedExistingSpeaker.id
                        : s.id }))));
            }
            catch (error) {
                console.error("error merging speakers:", error);
                toast({
                    title: "error",
                    description: "failed to merge speakers. please try again.",
                    variant: "destructive",
                });
            }
        }
        setShowMergeConfirm(false);
    });
    const handleMarkSpeakerAsHallucination = () => __awaiter(this, void 0, void 0, function* () {
        // use the endpoint /speakers/hallucination to mark the speaker as hallucination
        try {
            yield fetch(`http://localhost:3030/speakers/hallucination`, {
                method: "POST",
                body: JSON.stringify({
                    speaker_id: unnamedSpeakers[currentSpeakerIndex].id,
                }),
                headers: {
                    "Content-Type": "application/json",
                },
            });
        }
        catch (error) {
            console.error("error ignoring speaker:", error);
            toast({
                title: "error",
                description: "failed to ignore speaker. please try again.",
                variant: "destructive",
            });
        }
    });
    // 4. Return null on first render to avoid hydration mismatch
    if (!mounted) {
        return null;
    }
    return segments ? (<dialog_1.Dialog open={showIdentifySpeakers} onOpenChange={setShowIdentifySpeakers}>
      <dialog_1.DialogTrigger asChild>
        <button_1.Button onClick={() => setShowIdentifySpeakers(true)} size="sm" className="text-xs bg-black text-white hover:bg-gray-800">
          <lucide_react_1.Fingerprint className="mr-2 h-4 w-4"/>
          identify speakers
        </button_1.Button>
      </dialog_1.DialogTrigger>
      <dialog_1.DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <dialog_1.DialogHeader className="py-4">
          <dialog_1.DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              identify speakers based on recent audio clips
              <badge_1.Badge variant="secondary" className="ml-2">
                experimental
              </badge_1.Badge>
            </div>
          </dialog_1.DialogTitle>
        </dialog_1.DialogHeader>
        <div className="flex-grow overflow-auto min-h-[600px] flex flex-col">
          {loading ? (<div className="space-y-6 min-h-[600px]">
              {[1, 2, 3].map((i) => (<div key={i} className="p-4 border rounded animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-20 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                </div>))}
            </div>) : (<div className="min-h-[600px] flex flex-col">
              {showError && error && (<div className="bg-gray-100 border-l-4 border-black text-gray-700 p-4 mb-4 flex justify-between items-center" role="alert">
                  <div>
                    <p className="font-bold">warning</p>
                    <p>{error}</p>
                  </div>
                  <button onClick={() => setShowError(false)} className="text-gray-700 hover:text-black">
                    <lucide_react_1.X size={18}/>
                  </button>
                </div>)}
              {unnamedSpeakers.length === 0 && !loading && !error && (<p className="text-center">no unnamed speakers found.</p>)}

              {unnamedSpeakers.length > 0 && (<div className="mx-4">
                  <div className="p-4 border rounded h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">identify speaker</span>
                      </div>
                    </div>
                    <form className="space-y-4" onSubmit={(e) => __awaiter(this, void 0, void 0, function* () {
                    e.preventDefault();
                    setShowNameUpdateConfirm(true);
                    yield fetchSpeakers(speakerSearchTerm);
                })}>
                      <div className="flex items-center space-x-2">
                        <div className="relative flex-1 max-w-xs">
                          <input_1.Input onFocus={() => {
                    setShowSpeakerNames(true);
                }} onBlur={(e) => {
                    // Add a small delay to allow the click event to fire first
                    setTimeout(() => {
                        setShowSpeakerNames(false);
                    }, 200);
                }} value={speakerSearchTerm} name="speakerName" onChange={(e) => {
                    const newValue = e.target.value;
                    setSpeakerSearchTerm(newValue);
                    // Only filter existing speakers if we have any
                    if (speakers.length > 0) {
                        setSpeakers(speakers.filter((speaker) => speaker.name
                            .toLowerCase()
                            .includes(newValue.toLowerCase())));
                    }
                }} onKeyDown={(e) => {
                    if (e.key === " " && !segments) {
                        setSpeakerSearchTerm(speakerSearchTerm + " ");
                    }
                }} placeholder="Enter speaker name" className="w-full"/>
                          {speakerSearchTerm && (<div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {isSearching ? (<div className="flex justify-center items-center p-4">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                                </div>) : (showSpeakerNames && (<ul className="py-1">
                                    {speakers.map((speaker) => (<li key={speaker.id} className="px-3 py-2 hover:bg-gray-100 cursor-pointer truncate" onClick={(e) => {
                                setSpeakerSearchTerm(speaker.name);
                                setSelectedExistingSpeaker(speaker);
                                setShowMergeConfirm(true);
                                setShowSpeakerNames(false);
                            }}>
                                        {speaker.name}
                                      </li>))}
                                  </ul>))}
                            </div>)}
                        </div>
                        <button_1.Button type="submit" disabled={!speakerSearchTerm || speakerIdentified} size="sm" onClick={(e) => {
                    e.preventDefault();
                    setShowNameUpdateConfirm(true);
                }}>
                          <lucide_react_1.Save className="mr-2"/>
                          update name
                        </button_1.Button>
                        <button_1.Button type="button" variant="outline" disabled={speakerIdentified} onClick={(e) => __awaiter(this, void 0, void 0, function* () {
                    e.preventDefault();
                    setShowHallucinationConfirm(true);
                })}>
                          <lucide_react_1.Ghost className="mr-2"/>
                          nobody is speaking
                        </button_1.Button>
                        <button_1.Button type="button" disabled={speakerIdentified} variant="secondary" onClick={(e) => __awaiter(this, void 0, void 0, function* () {
                    e.preventDefault();
                    setShowRemoveSpeakerConfirm(true);
                })}>
                          <lucide_react_1.Trash className="mr-2"/>
                          remove speaker
                        </button_1.Button>
                      </div>
                    </form>

                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">
                        audio samples:
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {(_a = unnamedSpeakers[currentSpeakerIndex].metadata) === null || _a === void 0 ? void 0 : _a.audioSamples.slice(0, 3).map((sample, index) => (<video_1.VideoComponent key={index} filePath={sample.path} customDescription={`transcript: ${sample.transcript}`}/>))}
                      </div>
                    </div>
                    {speakerIdentified && (<div className="mt-4 flex justify-end">
                        <button_1.Button onClick={() => {
                        handleRefresh();
                    }}>
                          next speaker
                          <lucide_react_1.ChevronRight className="ml-2"/>
                        </button_1.Button>
                      </div>)}
                    <div className="mt-8">
                      {similarSpeakers.length > 0 && (<p className="text-sm text-gray-500 mb-4">
                          is this the same speaker?
                        </p>)}
                      {isFetchingSimilarSpeakers ? (<div className="flex justify-center items-center p-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                        </div>) : (<div>
                          {similarSpeakers.map((speaker, index) => {
                        var _a;
                        if (similarSpeakerIndex !== index) {
                            return null;
                        }
                        return (<div className="flex space-x-2 items-center" key={speaker.id}>
                                <span>{speaker.name || ""}</span>
                                {(_a = speaker.metadata) === null || _a === void 0 ? void 0 : _a.audioSamples.map((sample) => (<video_1.VideoComponent key={sample.path} filePath={sample.path} customDescription={`transcript: ${sample.transcript}`} className="max-w-[300px]"/>))}
                                <button_1.Button size="default" variant="default" onClick={() => {
                                setSelectedExistingSpeaker(speaker);
                                setShowMergeConfirm(true);
                            }}>
                                  <lucide_react_1.Check className="mr-2"/>
                                  same speaker
                                </button_1.Button>
                                <button_1.Button size="default" variant="outline" onClick={() => {
                                const newSpeakers = similarSpeakers.filter((s) => s.id !== speaker.id);
                                setSimilarSpeakers(newSpeakers);
                                setSimilarSpeakerIndex(Math.max(0, Math.min(similarSpeakerIndex, newSpeakers.length - 1)));
                            }}>
                                  <lucide_react_1.X className="mr-2"/>
                                  different speaker
                                </button_1.Button>
                                <button_1.Button size="default" className={similarSpeakers.length === 1 ? "hidden" : ""} variant="secondary" onClick={() => {
                                setSimilarSpeakerIndex((index + 1) % similarSpeakers.length);
                            }}>
                                  skip
                                  <lucide_react_1.ChevronRight className="ml-2"/>
                                </button_1.Button>
                              </div>);
                    })}
                        </div>)}
                    </div>
                  </div>
                </div>)}
            </div>)}
        </div>
      </dialog_1.DialogContent>
      <dialog_1.Dialog open={showHallucinationConfirm} onOpenChange={setShowHallucinationConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>confirm</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              are you sure you nobody is speaking? this action cannot be undone.
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="outline" onClick={() => setShowHallucinationConfirm(false)}>
              cancel
            </button_1.Button>
            <button_1.Button variant="default" onClick={() => __awaiter(this, void 0, void 0, function* () {
            yield handleMarkSpeakerAsHallucination();
            setShowHallucinationConfirm(false);
            toast({
                title: "speaker ignored",
                description: "This speaker will be ignored in future processing",
            });
            setSpeakerIdentified(true);
        })}>
              confirm
            </button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
      <dialog_1.Dialog open={showNameUpdateConfirm} onOpenChange={setShowNameUpdateConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>confirm name update</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              are you sure you want to update this speaker&apos;s name to &quot;
              {speakerSearchTerm}
              &quot;?
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="ghost" onClick={() => setShowNameUpdateConfirm(false)}>
              cancel
            </button_1.Button>
            <button_1.Button onClick={() => __awaiter(this, void 0, void 0, function* () {
            yield handleUpdateSpeakerName(speakerSearchTerm);
            setShowNameUpdateConfirm(false);
            toast({
                title: "speaker renamed",
                description: "the speaker name has been updated",
            });
        })}>
              confirm
            </button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
      <dialog_1.Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>merge speakers</dialog_1.DialogTitle>
            {(selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name) ? (<dialog_1.DialogDescription>
                do you want to merge this speaker with existing speaker
                {` "${selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name}"`}? this will combine their
                audio samples and future recordings.
              </dialog_1.DialogDescription>) : (<dialog_1.DialogDescription>
                do you want to merge this speaker? this will combine their audio
                samples and future recordings.
              </dialog_1.DialogDescription>)}
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="ghost" onClick={() => setShowMergeConfirm(false)}>
              cancel
            </button_1.Button>
            {(selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name) && (<button_1.Button variant="outline" onClick={() => {
                setShowMergeConfirm(false);
                // Still update the name without merging
                handleUpdateSpeakerName((selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name) || "");
                toast({
                    title: "speaker renamed",
                    description: "the speaker name has been updated without merging",
                });
            }}>
                just update name
              </button_1.Button>)}

            <button_1.Button onClick={handleMergeSpeakers}>merge speakers</button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
      <dialog_1.Dialog open={showRemoveSpeakerConfirm} onOpenChange={setShowRemoveSpeakerConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>confirm remove speaker</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              are you sure you want to remove this speaker? this action cannot
              be undone.
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="outline" onClick={() => setShowRemoveSpeakerConfirm(false)}>
              cancel
            </button_1.Button>
            <button_1.Button onClick={() => __awaiter(this, void 0, void 0, function* () {
            yield handleRemoveSpeaker();
            setShowRemoveSpeakerConfirm(false);
            toast({
                title: "speaker removed",
                description: "the speaker has been removed",
            });
        })}>
              confirm
            </button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </dialog_1.Dialog>) : (<card_1.Card>
      <card_1.CardHeader>
        <card_1.CardTitle>identify speakers</card_1.CardTitle>
        <card_1.CardDescription>
          identify speakers based on recent audio clips
          <badge_1.Badge variant="secondary" className="ml-2">
            experimental
          </badge_1.Badge>
        </card_1.CardDescription>
      </card_1.CardHeader>
      <card_1.CardContent className="max-w-[90vw] w-full max-h-[90vh] h-full">
        <div className="flex-grow overflow-auto min-h-[600px] flex flex-col">
          {loading ? (<div className="space-y-6 min-h-[600px]">
              {[1, 2, 3].map((i) => (<div key={i} className="p-4 border rounded animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-20 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                </div>))}
            </div>) : (<div className="min-h-[600px] flex flex-col">
              {showError && error && (<div className="bg-gray-100 border-l-4 border-black text-gray-700 p-4 mb-4 flex justify-between items-center" role="alert">
                  <div>
                    <p className="font-bold">warning</p>
                    <p>{error}</p>
                  </div>
                  <button onClick={() => setShowError(false)} className="text-gray-700 hover:text-black">
                    <lucide_react_1.X size={18}/>
                  </button>
                </div>)}
              {unnamedSpeakers.length === 0 && !loading && !error && (<p className="text-center">no unnamed speakers found.</p>)}

              {unnamedSpeakers.length > 0 && (<div className="mx-4">
                  <div className="p-4 border rounded h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">identify speaker</span>
                      </div>
                    </div>
                    <form className="space-y-4" onSubmit={(e) => __awaiter(this, void 0, void 0, function* () {
                    e.preventDefault();
                    setShowNameUpdateConfirm(true);
                    yield fetchSpeakers(speakerSearchTerm);
                })}>
                      <div className="flex items-center space-x-2">
                        <div className="relative flex-1 max-w-xs">
                          <input_1.Input onFocus={() => {
                    setShowSpeakerNames(true);
                }} onBlur={(e) => {
                    // Add a small delay to allow the click event to fire first
                    setTimeout(() => {
                        setShowSpeakerNames(false);
                    }, 200);
                }} value={speakerSearchTerm} name="speakerName" onChange={(e) => {
                    const newValue = e.target.value;
                    setSpeakerSearchTerm(newValue);
                    // Only filter existing speakers if we have any
                    if (speakers.length > 0) {
                        setSpeakers(speakers.filter((speaker) => speaker.name
                            .toLowerCase()
                            .includes(newValue.toLowerCase())));
                    }
                }} onKeyDown={(e) => {
                    if (e.key === " " && !segments) {
                        setSpeakerSearchTerm(speakerSearchTerm + " ");
                    }
                }} placeholder="Enter speaker name" className="w-full"/>
                          {speakerSearchTerm && (<div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {isSearching ? (<div className="flex justify-center items-center p-4">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                                </div>) : (showSpeakerNames && (<ul className="py-1">
                                    {speakers.map((speaker) => (<li key={speaker.id} className="px-3 py-2 hover:bg-gray-100 cursor-pointer truncate" onClick={(e) => {
                                setSpeakerSearchTerm(speaker.name);
                                setSelectedExistingSpeaker(speaker);
                                setShowMergeConfirm(true);
                                setShowSpeakerNames(false);
                            }}>
                                        {speaker.name}
                                      </li>))}
                                  </ul>))}
                            </div>)}
                        </div>
                        <button_1.Button type="submit" disabled={!speakerSearchTerm || speakerIdentified} size="sm" onClick={(e) => {
                    e.preventDefault();
                    setShowNameUpdateConfirm(true);
                }}>
                          <lucide_react_1.Save className="mr-2"/>
                          update name
                        </button_1.Button>
                        <button_1.Button type="button" variant="outline" disabled={speakerIdentified} onClick={(e) => __awaiter(this, void 0, void 0, function* () {
                    e.preventDefault();
                    setShowHallucinationConfirm(true);
                })}>
                          <lucide_react_1.Ghost className="mr-2"/>
                          nobody is speaking
                        </button_1.Button>
                        <button_1.Button type="button" disabled={speakerIdentified} variant="secondary" onClick={(e) => __awaiter(this, void 0, void 0, function* () {
                    e.preventDefault();
                    setShowRemoveSpeakerConfirm(true);
                })}>
                          <lucide_react_1.Trash className="mr-2"/>
                          remove speaker
                        </button_1.Button>
                      </div>
                    </form>

                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">
                        audio samples:
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {(_b = unnamedSpeakers[currentSpeakerIndex].metadata) === null || _b === void 0 ? void 0 : _b.audioSamples.slice(0, 3).map((sample, index) => (<video_1.VideoComponent key={index} filePath={sample.path} customDescription={`transcript: ${sample.transcript}`}/>))}
                      </div>
                    </div>
                    {speakerIdentified && (<div className="mt-4 flex justify-end">
                        <button_1.Button onClick={() => {
                        handleRefresh();
                    }}>
                          next speaker
                          <lucide_react_1.ChevronRight className="ml-2"/>
                        </button_1.Button>
                      </div>)}
                    <div className="mt-8">
                      {similarSpeakers.length > 0 && (<p className="text-sm text-gray-500 mb-4">
                          is this the same speaker?
                        </p>)}
                      {isFetchingSimilarSpeakers ? (<div className="flex justify-center items-center p-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                        </div>) : (<div>
                          {similarSpeakers.map((speaker, index) => {
                        var _a;
                        if (similarSpeakerIndex !== index) {
                            return null;
                        }
                        return (<div className="flex space-x-2 items-center" key={speaker.id}>
                                <span>{speaker.name || ""}</span>
                                {(_a = speaker.metadata) === null || _a === void 0 ? void 0 : _a.audioSamples.map((sample) => (<video_1.VideoComponent key={sample.path} filePath={sample.path} customDescription={`transcript: ${sample.transcript}`} className="max-w-[300px]"/>))}
                                <button_1.Button size="default" variant="default" onClick={() => {
                                setSelectedExistingSpeaker(speaker);
                                setShowMergeConfirm(true);
                            }}>
                                  <lucide_react_1.Check className="mr-2"/>
                                  same speaker
                                </button_1.Button>
                                <button_1.Button size="default" variant="outline" onClick={() => {
                                const newSpeakers = similarSpeakers.filter((s) => s.id !== speaker.id);
                                setSimilarSpeakers(newSpeakers);
                                setSimilarSpeakerIndex(Math.max(0, Math.min(similarSpeakerIndex, newSpeakers.length - 1)));
                            }}>
                                  <lucide_react_1.X className="mr-2"/>
                                  different speaker
                                </button_1.Button>
                                <button_1.Button size="default" className={similarSpeakers.length === 1 ? "hidden" : ""} variant="secondary" onClick={() => {
                                setSimilarSpeakerIndex((index + 1) % similarSpeakers.length);
                            }}>
                                  skip
                                  <lucide_react_1.ChevronRight className="ml-2"/>
                                </button_1.Button>
                              </div>);
                    })}
                        </div>)}
                    </div>
                  </div>
                </div>)}
            </div>)}
        </div>
      </card_1.CardContent>
      <dialog_1.Dialog open={showHallucinationConfirm} onOpenChange={setShowHallucinationConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>confirm</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              are you sure you nobody is speaking? this action cannot be undone.
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="outline" onClick={() => setShowHallucinationConfirm(false)}>
              cancel
            </button_1.Button>
            <button_1.Button variant="default" onClick={() => __awaiter(this, void 0, void 0, function* () {
            yield handleMarkSpeakerAsHallucination();
            setShowHallucinationConfirm(false);
            toast({
                title: "speaker ignored",
                description: "This speaker will be ignored in future processing",
            });
            setSpeakerIdentified(true);
        })}>
              confirm
            </button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
      <dialog_1.Dialog open={showNameUpdateConfirm} onOpenChange={setShowNameUpdateConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>confirm name update</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              are you sure you want to update this speaker&apos;s name to &quot;
              {speakerSearchTerm}
              &quot;?
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="ghost" onClick={() => setShowNameUpdateConfirm(false)}>
              cancel
            </button_1.Button>
            <button_1.Button onClick={() => __awaiter(this, void 0, void 0, function* () {
            yield handleUpdateSpeakerName(speakerSearchTerm);
            setShowNameUpdateConfirm(false);
            toast({
                title: "speaker renamed",
                description: "the speaker name has been updated",
            });
        })}>
              confirm
            </button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
      <dialog_1.Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>merge speakers</dialog_1.DialogTitle>
            {(selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name) ? (<dialog_1.DialogDescription>
                do you want to merge this speaker with existing speaker
                {` "${selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name}"`}? this will combine their
                audio samples and future recordings.
              </dialog_1.DialogDescription>) : (<dialog_1.DialogDescription>
                do you want to merge this speaker? this will combine their audio
                samples and future recordings.
              </dialog_1.DialogDescription>)}
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="ghost" onClick={() => setShowMergeConfirm(false)}>
              cancel
            </button_1.Button>
            {(selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name) && (<button_1.Button variant="outline" onClick={() => {
                setShowMergeConfirm(false);
                // Still update the name without merging
                handleUpdateSpeakerName((selectedExistingSpeaker === null || selectedExistingSpeaker === void 0 ? void 0 : selectedExistingSpeaker.name) || "");
                toast({
                    title: "speaker renamed",
                    description: "the speaker name has been updated without merging",
                });
            }}>
                just update name
              </button_1.Button>)}

            <button_1.Button onClick={handleMergeSpeakers}>merge speakers</button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
      <dialog_1.Dialog open={showRemoveSpeakerConfirm} onOpenChange={setShowRemoveSpeakerConfirm}>
        <dialog_1.DialogContent className="sm:max-w-[425px]">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>confirm remove speaker</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              are you sure you want to remove this speaker? this action cannot
              be undone.
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="flex justify-end space-x-2">
            <button_1.Button variant="outline" onClick={() => setShowRemoveSpeakerConfirm(false)}>
              cancel
            </button_1.Button>
            <button_1.Button onClick={() => __awaiter(this, void 0, void 0, function* () {
            yield handleRemoveSpeaker();
            setShowRemoveSpeakerConfirm(false);
            toast({
                title: "speaker removed",
                description: "the speaker has been removed",
            });
        })}>
              confirm
            </button_1.Button>
          </div>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </card_1.Card>);
}
