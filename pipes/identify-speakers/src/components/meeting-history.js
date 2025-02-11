"use strict";
"use client";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MeetingHistory;
const react_1 = __importStar(require("react"));
const button_1 = require("@/components/ui/button");
const openai_1 = require("openai");
const use_settings_1 = require("@/lib/hooks/use-settings");
const use_toast_1 = require("./ui/use-toast");
const react_markdown_1 = __importDefault(require("react-markdown"));
const lucide_react_1 = require("lucide-react");
const badge_1 = require("./ui/badge");
const use_copy_to_clipboard_1 = require("@/lib/hooks/use-copy-to-clipboard");
const localforage_1 = __importDefault(require("localforage"));
const tooltip_1 = require("@/components/ui/tooltip");
const input_1 = require("./ui/input");
const utils_1 = require("@/lib/utils");
const card_1 = require("@/components/ui/card");
const checkbox_1 = require("./ui/checkbox");
function formatDate(date) {
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
function setItem(key, value) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (typeof window !== "undefined") {
                yield localforage_1.default.setItem(key, value);
            }
        }
        catch (error) {
            console.error("error setting item in storage:", error);
            throw error;
        }
    });
}
function getItem(key) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (typeof window !== "undefined") {
                return yield localforage_1.default.getItem(key);
            }
        }
        catch (error) {
            console.error("error getting item from storage:", error);
            throw error;
        }
        return null;
    });
}
function MeetingHistory({ showMeetingHistory, setShowMeetingHistory, className, }) {
    const { settings } = (0, use_settings_1.useSettings)();
    const [meetings, setMeetings] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const [isSummarizing, setIsSummarizing] = (0, react_1.useState)(false);
    const [isIdentifying, setIsIdentifying] = (0, react_1.useState)(false);
    const { toast } = (0, use_toast_1.useToast)();
    const [showError, setShowError] = (0, react_1.useState)(false);
    const { copyToClipboard } = (0, use_copy_to_clipboard_1.useCopyToClipboard)({ timeout: 2000 });
    const [isRefreshing, setIsRefreshing] = (0, react_1.useState)(false);
    const [customSummaryPrompt, setCustomSummaryPrompt] = (0, react_1.useState)("please provide a concise summary of the following meeting transcript");
    const [isClearing, setIsClearing] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (showMeetingHistory) {
            loadMeetings();
        }
    }, [showMeetingHistory]);
    (0, react_1.useEffect)(() => {
        setShowError(!!error);
    }, [error]);
    (0, react_1.useEffect)(() => {
        console.log("Dialog state changed:", showMeetingHistory);
    }, [showMeetingHistory]);
    function loadMeetings() {
        return __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            try {
                const storedMeetings = (yield getItem("meetings")) || [];
                setMeetings(storedMeetings);
                yield fetchMeetings();
            }
            catch (err) {
                setError("failed to load meetings");
            }
            finally {
                setLoading(false);
            }
        });
    }
    function fetchMeetings() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("fetching meetings...");
            setLoading(true);
            try {
                // Always fetch from the last 7x24 hours
                const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                console.log("searching from:", startTime);
                const response = yield fetch(`http://localhost:3030/search?content_type=audio&start_time=${startTime}&limit=1000`);
                if (!response.ok) {
                    throw new Error("failed to fetch meeting history");
                }
                const result = yield response.json();
                const camelCaseResult = (0, utils_1.keysToCamelCase)(result);
                console.log("fetch result:", camelCaseResult);
                const newMeetings = processMeetings(camelCaseResult.data);
                console.log("processed new meetings:", newMeetings);
                // merge new meetings with stored meetings, updating existing ones
                let updatedMeetings = [...meetings];
                newMeetings.forEach((newMeeting) => {
                    const existingMeetingIndex = updatedMeetings.findIndex((m) => m.meetingGroup === newMeeting.meetingGroup);
                    if (existingMeetingIndex === -1) {
                        // add new meeting if it doesn't exist
                        updatedMeetings.push(newMeeting);
                    }
                    else {
                        // update existing meeting with new data
                        updatedMeetings[existingMeetingIndex] = Object.assign(Object.assign(Object.assign({}, updatedMeetings[existingMeetingIndex]), newMeeting), { fullTranscription: updatedMeetings[existingMeetingIndex].fullTranscription +
                                newMeeting.fullTranscription });
                    }
                });
                // sort meetings by start time (descending)
                updatedMeetings.sort((a, b) => new Date(b.meetingStart).getTime() -
                    new Date(a.meetingStart).getTime());
                setMeetings(updatedMeetings);
                // store updated meetings
                yield setItem("meetings", updatedMeetings);
            }
            catch (err) {
                setError("some trouble fetching new meetings. please check health status.");
                console.error("fetch error:", err);
            }
            finally {
                console.log("fetch completed");
                setLoading(false);
            }
        });
    }
    function generateSummary(meeting) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            var _d, _e;
            setIsSummarizing(true);
            try {
                const openai = new openai_1.OpenAI({
                    apiKey: settings.aiProviderType === "screenpipe-cloud"
                        ? settings.user.token
                        : settings.openaiApiKey,
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
                        role: "user", // claude does not support system messages?
                        content: `you are a helpful assistant that summarizes meetings. `,
                    },
                    {
                        role: "user",
                        content: `${enhancedPrompt}:\n\n${meeting.segments
                            .map((s) => s.transcription)
                            .join("\n")}`,
                    },
                ];
                const stream = yield openai.chat.completions.create({
                    model: model,
                    messages: messages,
                    stream: true,
                });
                let summary = "";
                const updatedMeeting = Object.assign(Object.assign({}, meeting), { summary: "" });
                try {
                    for (var _f = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _f = true) {
                        _c = stream_1_1.value;
                        _f = false;
                        const chunk = _c;
                        const content = ((_e = (_d = chunk.choices[0]) === null || _d === void 0 ? void 0 : _d.delta) === null || _e === void 0 ? void 0 : _e.content) || "";
                        summary += content;
                        updatedMeeting.summary = summary;
                        // update the meeting with the new summary
                        const updatedMeetings = meetings.map((m) => m.meetingGroup === meeting.meetingGroup ? updatedMeeting : m);
                        setMeetings(updatedMeetings);
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_f && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                // final update after streaming is complete
                const finalUpdatedMeetings = meetings.map((m) => m.meetingGroup === meeting.meetingGroup ? updatedMeeting : m);
                setMeetings(finalUpdatedMeetings);
                try {
                    console.log("updating meetings state...");
                    setMeetings(finalUpdatedMeetings);
                    console.log("storing meetings in storage...");
                    yield setItem("meetings", finalUpdatedMeetings);
                    console.log("storage operation completed");
                    toast({
                        title: "summary generated",
                        description: "the meeting summary has been created and saved successfully.",
                    });
                }
                catch (storageError) {
                    console.error("error updating storage:", storageError);
                    toast({
                        title: "warning",
                        description: "summary generated but couldn't be saved due to storage limits. older meetings might be removed to make space.",
                        variant: "destructive",
                    });
                    // attempt to remove older meetings to make space
                    try {
                        const oldMeetings = (yield getItem("meetings")) || [];
                        const meetingsToKeep = oldMeetings.slice(-10); // keep only the last 10 meetings
                        yield setItem("meetings", meetingsToKeep);
                        setMeetings(meetingsToKeep);
                        toast({
                            title: "storage cleaned",
                            description: "older meetings were removed to make space for new ones.",
                        });
                    }
                    catch (cleanupError) {
                        console.error("failed to clean up storage:", cleanupError);
                        toast({
                            title: "error",
                            description: "failed to clean up storage. please clear your browser data manually.",
                            variant: "destructive",
                        });
                    }
                }
            }
            catch (error) {
                console.error("error generating summary:", error);
                toast({
                    title: "error",
                    description: "failed to generate meeting summary. please try again.",
                    variant: "destructive",
                });
            }
            finally {
                setIsSummarizing(false);
            }
        });
    }
    function formatTimestamp(timestamp) {
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
    function processMeetings(transcriptions) {
        console.log("processing transcriptions:", transcriptions);
        let meetings = [];
        let currentMeeting = null;
        let meetingGroup = 0;
        // sort transcriptions by timestamp
        transcriptions.sort((a, b) => new Date(a.content.timestamp).getTime() -
            new Date(b.content.timestamp).getTime());
        transcriptions.forEach((trans, index) => {
            var _a, _b, _c;
            const currentTime = new Date(trans.content.timestamp);
            const prevTime = index > 0
                ? new Date(transcriptions[index - 1].content.timestamp)
                : null;
            // Get speaker name based on speaker info or device type
            const speakerName = ((_a = trans.content.speaker) === null || _a === void 0 ? void 0 : _a.name) && trans.content.speaker.name.length > 0
                ? trans.content.speaker.name
                : ((_b = trans.content.deviceType) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === "input"
                    ? "you"
                    : ((_c = trans.content.deviceType) === null || _c === void 0 ? void 0 : _c.toLowerCase()) === "output"
                        ? "others"
                        : "unknown";
            if (!currentMeeting ||
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
                    fullTranscription: `${formatTimestamp(trans.content.timestamp)} [${speakerName}] ${trans.content.transcription}\n`,
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
            }
            else if (currentMeeting) {
                currentMeeting.meetingEnd = trans.content.timestamp;
                currentMeeting.fullTranscription += `${formatTimestamp(trans.content.timestamp)} [${speakerName}] ${trans.content.transcription}\n`;
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
        meetings.sort((a, b) => new Date(b.meetingStart).getTime() - new Date(a.meetingStart).getTime());
        // remove duplicate meetings
        meetings = meetings.filter((meeting, index, self) => index === self.findIndex((t) => t.meetingGroup === meeting.meetingGroup));
        console.log("processed meetings:", meetings);
        return meetings.filter((m) => m.fullTranscription.replace(/\n/g, "").length >= 200);
    }
    // Memoize expensive computations
    const sortedMeetings = (0, react_1.useMemo)(() => {
        return [...meetings].sort((a, b) => new Date(b.meetingStart).getTime() - new Date(a.meetingStart).getTime());
    }, [meetings]);
    const copyWithToast = (content, type) => {
        copyToClipboard(content);
        toast({
            title: "copied to clipboard",
            description: `${type} has been copied to your clipboard.`,
        });
    };
    const handleRefresh = () => __awaiter(this, void 0, void 0, function* () {
        setIsRefreshing(true);
        try {
            yield fetchMeetings();
            toast({
                title: "meetings refreshed",
                description: "your meeting history has been updated.",
            });
        }
        catch (error) {
            console.error("error refreshing meetings:", error);
            toast({
                title: "refresh failed",
                description: "failed to refresh meetings. please try again.",
                variant: "destructive",
            });
        }
        finally {
            setIsRefreshing(false);
        }
    });
    const handleClearMeetings = () => __awaiter(this, void 0, void 0, function* () {
        setIsClearing(true);
        try {
            yield localforage_1.default.removeItem("meetings");
            setMeetings([]);
            toast({
                title: "meeting data cleared",
                description: "all stored meeting data has been removed.",
            });
        }
        catch (error) {
            console.error("error clearing meeting data:", error);
            toast({
                title: "error",
                description: "failed to clear meeting data. please try again.",
                variant: "destructive",
            });
        }
        finally {
            setIsClearing(false);
        }
    });
    const mergeMeetings = (index) => {
        const updatedMeetings = [...meetings];
        const currentMeeting = updatedMeetings[index];
        const nextMeeting = updatedMeetings[index + 1];
        const mergedMeeting = Object.assign(Object.assign({}, currentMeeting), { meetingEnd: new Date(Math.max(new Date(currentMeeting.meetingEnd).getTime(), new Date(nextMeeting.meetingEnd).getTime())).toISOString(), meetingStart: new Date(Math.min(new Date(currentMeeting.meetingStart).getTime(), new Date(nextMeeting.meetingStart).getTime())).toISOString(), fullTranscription: `${currentMeeting.fullTranscription}\n${nextMeeting.fullTranscription}`, mergedWith: [
                ...(currentMeeting.mergedWith || []),
                nextMeeting.meetingGroup,
                ...(nextMeeting.mergedWith || []),
            ], segments: [...currentMeeting.segments, ...nextMeeting.segments], selectedDevices: new Set([
                ...Array.from(currentMeeting.selectedDevices),
                ...Array.from(nextMeeting.selectedDevices),
            ]) });
        updatedMeetings[index] = mergedMeeting;
        updatedMeetings.splice(index + 1, 1); // remove the next meeting
        setMeetings(updatedMeetings);
        setItem("meetings", updatedMeetings);
    };
    const handleDeviceToggle = (0, react_1.useCallback)((meetingGroup, deviceName, isChecked) => {
        setMeetings((prevMeetings) => {
            return prevMeetings.map((meeting) => {
                if (meeting.meetingGroup === meetingGroup) {
                    const updatedSelectedDevices = new Set(meeting.selectedDevices);
                    if (isChecked) {
                        updatedSelectedDevices.add(deviceName);
                    }
                    else {
                        updatedSelectedDevices.delete(deviceName);
                    }
                    return Object.assign(Object.assign({}, meeting), { selectedDevices: updatedSelectedDevices });
                }
                return meeting;
            });
        });
    }, []);
    return (<card_1.Card>
      <card_1.CardContent className="h-full" onClick={(e) => {
            e.stopPropagation();
        }}>
        <card_1.CardHeader className="py-4">
          <card_1.CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              meeting and conversation history
              <badge_1.Badge variant="secondary" className="ml-2">
                experimental
              </badge_1.Badge>
            </div>
            <div className="flex space-x-2">
              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <button_1.Button onClick={handleClearMeetings} disabled={isClearing} size="sm" variant="outline" className="text-xs">
                      {isClearing ? (<lucide_react_1.Trash2 className="h-4 w-4 animate-pulse"/>) : (<lucide_react_1.Trash2 className="h-4 w-4"/>)}
                      <span className="ml-2">reset data</span>
                    </button_1.Button>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent side="left">
                    <p>
                      this will restore your meeting data to the original state
                      based on transcription timestamps,
                      <br />
                      without the editing you have done here
                    </p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>

              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <button_1.Button onClick={handleRefresh} disabled={isRefreshing} size="sm" variant="outline" className="text-xs ">
                      {isRefreshing ? (<lucide_react_1.RefreshCw className="h-4 w-4 animate-spin"/>) : (<lucide_react_1.RefreshCw className="h-4 w-4"/>)}
                      <span className="ml-2">refresh</span>
                    </button_1.Button>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent side="left">
                    <p>fetch latest meeting data</p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
          </card_1.CardTitle>
        </card_1.CardHeader>
        <card_1.CardDescription className="mb-4">
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
        </card_1.CardDescription>
        <div className="flex-grow overflow-auto">
          {loading ? (<div className="space-y-6">
              {[1, 2, 3].map((i) => (<div key={i} className="p-4 border rounded animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="h-20 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                </div>))}
            </div>) : (<>
              {showError && error && (<div className="bg-gray-100 border-l-4 border-black text-gray-700 p-4 mb-4 flex justify-between items-center" role="alert">
                  <div>
                    <p className="font-bold">warning</p>
                    <p>{error}</p>
                  </div>
                  <button onClick={() => setShowError(false)} className="text-gray-700 hover:text-black">
                    <lucide_react_1.X size={18}/>
                  </button>
                </div>)}
              {meetings.length === 0 && !loading && !error && (<p className="text-center">no meetings found.</p>)}
              <div className="space-y-6">
                {sortedMeetings.map((meeting, index) => (<react_1.default.Fragment key={index}>
                    <card_1.Card className="relative">
                      <card_1.CardHeader>
                        <div className="grid grid-cols-2">
                          <div>
                            <card_1.CardTitle className="text-lg font-semibold flex flex-wrap items-center gap-2">
                              meeting {meeting.meetingGroup}
                              {meeting.mergedWith &&
                    meeting.mergedWith.length > 0 && (<>
                                    <badge_1.Badge variant="secondary">merged</badge_1.Badge>
                                    {meeting.mergedWith.map((mergedGroupId) => (<badge_1.Badge key={mergedGroupId} variant="outline">
                                        meeting {mergedGroupId}
                                      </badge_1.Badge>))}
                                  </>)}
                            </card_1.CardTitle>
                            <card_1.CardDescription>
                              {formatDate(meeting.meetingStart)} -{" "}
                              {formatDate(meeting.meetingEnd)}
                            </card_1.CardDescription>
                          </div>
                          <div className="mb-4 text-end">
                            <h4 className="font-semibold mb-2">Devices:</h4>
                            <div className="flex flex-wrap gap-4 justify-end">
                              {Array.from(meeting.deviceNames).map((deviceName) => (<label key={deviceName} className="flex items-center space-x-2">
                                    <checkbox_1.Checkbox checked={meeting.selectedDevices.has(deviceName)} onCheckedChange={(checked) => handleDeviceToggle(meeting.meetingGroup, deviceName, checked)}/>
                                    <span className="text-sm">
                                      {deviceName}
                                    </span>
                                  </label>))}
                            </div>
                          </div>
                        </div>
                      </card_1.CardHeader>
                      <card_1.CardContent>
                        <div className="mb-4 relative">
                          <h4 className="font-semibold mb-2">transcription:</h4>
                          <button_1.Button onClick={() => copyWithToast(meeting.segments
                    .filter((s) => meeting.selectedDevices.has(s.deviceName))
                    .map((s) => {
                    var _a;
                    return `${formatTimestamp(s.timestamp)} [${s.speaker
                        ? s.speaker.name
                        : ((_a = s.deviceType) === null || _a === void 0 ? void 0 : _a.toLowerCase()) ===
                            "input"
                            ? "you"
                            : "others"}] ${s.transcription}`;
                })
                    .join("\n"), "transcription")} className="absolute top-0 right-0 p-1 h-6 w-6" variant="outline" size="icon">
                            <lucide_react_1.Copy className="h-4 w-4"/>
                          </button_1.Button>
                          <pre className="whitespace-pre-wrap bg-gray-100 p-3 rounded text-sm max-h-40 overflow-y-auto">
                            {meeting.segments
                    .filter((s) => meeting.selectedDevices.has(s.deviceName))
                    .sort((a, b) => new Date(a.timestamp).getTime() -
                    new Date(b.timestamp).getTime())
                    .map((s, i) => {
                    var _a;
                    return (<react_1.default.Fragment key={i}>
                                  <span className="font-bold">
                                    {`${formatTimestamp(s.timestamp)} [${s.speaker
                            ? s.speaker.name
                            : ((_a = s.deviceType) === null || _a === void 0 ? void 0 : _a.toLowerCase()) ===
                                "input"
                                ? "you"
                                : "others"}]`}
                                  </span>{" "}
                                  {s.transcription}
                                  {"\n"}
                                </react_1.default.Fragment>);
                })}
                          </pre>
                        </div>
                        <div className="relative">
                          <h4 className="font-semibold mb-2">summary:</h4>
                          {meeting.summary && (<button_1.Button onClick={() => copyWithToast(meeting.summary || "", "summary")} className="absolute top-0 right-0 p-1 h-6 w-6" variant="outline" size="icon">
                              <lucide_react_1.Copy className="h-4 w-4"/>
                            </button_1.Button>)}
                          {meeting.summary ? (<react_markdown_1.default className="prose max-w-none">
                              {meeting.summary}
                            </react_markdown_1.default>) : (<div className="flex items-center mt-2">
                              <input_1.Input type="text" value={customSummaryPrompt} onChange={(e) => setCustomSummaryPrompt(e.target.value)} placeholder="custom summary prompt (optional)" className="mr-2 p-2 border rounded text-sm flex-grow"/>
                              <button_1.Button onClick={() => generateSummary(meeting)} disabled={isSummarizing}>
                                {isSummarizing ? (<lucide_react_1.FileText className="h-4 w-4 mr-2 animate-pulse"/>) : (<lucide_react_1.PlusCircle className="h-4 w-4 mr-2"/>)}
                                {isSummarizing
                        ? "generating summary..."
                        : "generate summary"}
                              </button_1.Button>
                            </div>)}
                        </div>
                      </card_1.CardContent>
                    </card_1.Card>
                    {index < sortedMeetings.length - 1 && (<div className="flex justify-center my-2">
                        <button_1.Button onClick={() => mergeMeetings(index)} size="sm" variant="outline" className="text-xs">
                          <lucide_react_1.ChevronDown className="h-4 w-4 mr-2"/>
                          merge with next meeting
                        </button_1.Button>
                      </div>)}
                  </react_1.default.Fragment>))}
              </div>
            </>)}
        </div>
      </card_1.CardContent>
    </card_1.Card>);
}
