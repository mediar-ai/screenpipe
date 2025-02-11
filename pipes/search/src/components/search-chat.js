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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchChat = SearchChat;
const react_1 = __importStar(require("react"));
const input_1 = require("@/components/ui/input");
const button_1 = require("@/components/ui/button");
const card_1 = require("@/components/ui/card");
const browser_1 = require("@screenpipe/browser");
const skeleton_1 = require("@/components/ui/skeleton");
const slider_1 = require("@/components/ui/slider");
const switch_1 = require("@/components/ui/switch");
const label_1 = require("@/components/ui/label");
const use_ai_provider_1 = require("@/lib/hooks/use-ai-provider");
const select_1 = require("@/components/ui/select");
const progress_1 = require("@/components/ui/progress");
const date_time_picker_1 = require("./date-time-picker");
const badge_1 = require("./ui/badge");
const lucide_react_1 = require("lucide-react");
const use_toast_1 = require("@/lib/use-toast");
const framer_motion_1 = require("framer-motion");
const ai_1 = require("ai");
const openai_1 = require("openai");
const chat_message_1 = require("@/components/chat-message");
const spinner_1 = require("@/components/spinner");
const accordion_1 = require("@/components/ui/accordion");
const video_1 = require("@/components/video");
const dialog_1 = require("@/components/ui/dialog");
const tooltip_1 = require("@/components/ui/tooltip");
const separator_1 = require("@/components/ui/separator");
const context_usage_indicator_1 = require("@/components/context-usage-indicator");
const checkbox_1 = require("@/components/ui/checkbox");
const icons_1 = require("@/components/ui/icons");
const codeblock_1 = require("@/components/ui/codeblock");
const sql_autocomplete_input_1 = require("@/components/sql-autocomplete-input");
const utils_1 = require("@/lib/utils");
const example_search_cards_1 = require("@/components/example-search-cards");
const use_debounce_1 = require("@/lib/hooks/use-debounce");
const use_health_check_1 = require("@/lib/hooks/use-health-check");
const use_search_history_1 = require("@/lib/hooks/use-search-history");
const command_1 = require("./ui/command");
const popover_1 = require("@/components/ui/popover");
const use_settings_1 = require("@/lib/hooks/use-settings");
const search_filter_generator_1 = require("./search-filter-generator");
const AGENTS = [
    {
        id: "context-master",
        name: "context master",
        description: "analyzes everything: apps, windows, text & audio",
        systemPrompt: "you analyze all types of data from screen recordings and audio transcriptions. provide comprehensive insights.",
        dataSelector: (results) => results,
    },
    {
        id: "window-detective",
        name: "window detective",
        description: "focuses on app usage patterns",
        systemPrompt: "you specialize in analyzing app usage patterns and window switching behavior. help users understand their app usage.",
        dataSelector: (results) => results
            .filter((item) => item.type === "OCR" &&
            (item.content.appName || item.content.windowName))
            .map((item) => ({
            timestamp: item.content.timestamp,
            // @ts-ignore
            appName: item.content.appName,
            // @ts-ignore
            windowName: item.content.windowName,
        })),
    },
    {
        id: "text-oracle",
        name: "text oracle",
        description: "analyzes screen text (OCR)",
        systemPrompt: "you focus on text extracted from screen recordings. help users find and understand text content.",
        dataSelector: (results) => results
            .filter((item) => item.type === "OCR")
            .map((item) => ({
            timestamp: item.content.timestamp,
            text: item.content.text,
            appName: item.content.appName,
        })),
    },
    {
        id: "voice-sage",
        name: "voice sage",
        description: "focuses on audio transcriptions",
        systemPrompt: "you analyze audio transcriptions from recordings. help users understand spoken content.",
        dataSelector: (results) => results
            .filter((item) => item.type === "Audio")
            .map((item) => ({
            timestamp: item.content.timestamp,
            transcription: item.content.transcription,
        })),
    },
];
// Add this helper function to highlight keywords in text
const highlightKeyword = (text, keyword) => {
    if (!keyword || !text)
        return <>{text}</>;
    const parts = text.split(new RegExp(`(${keyword})`, "gi"));
    return (<>
      {parts.map((part, i) => part.toLowerCase() === keyword.toLowerCase() ? (<span key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part}
          </span>) : (part))}
    </>);
};
// Update the getContextAroundKeyword function to return both text and positions
const getContextAroundKeyword = (text, keyword, contextLength = 40) => {
    if (!keyword || !text)
        return text;
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index === -1)
        return text;
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + keyword.length + contextLength);
    let result = text.slice(start, end);
    if (start > 0)
        result = "..." + result;
    if (end < text.length)
        result = result + "...";
    return result;
};
function SearchChat() {
    var _a;
    const { searches, currentSearchId, setCurrentSearchId, addSearch, deleteSearch, isCollapsed, toggleCollapse, } = (0, use_search_history_1.useSearchHistory)();
    // Search state
    const { health, isServerDown } = (0, use_health_check_1.useHealthCheck)();
    const [query, setQuery] = (0, react_1.useState)("");
    const [results, setResults] = (0, react_1.useState)([]);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [startDate, setStartDate] = (0, react_1.useState)(new Date(Date.now() - 24 * 3600000));
    const [endDate, setEndDate] = (0, react_1.useState)(new Date());
    const [includeFrames, setIncludeFrames] = (0, react_1.useState)(false);
    const [limit, setLimit] = (0, react_1.useState)(30);
    const [appName, setAppName] = (0, react_1.useState)("");
    const [windowName, setWindowName] = (0, react_1.useState)("");
    const [contentType, setContentType] = (0, react_1.useState)("all");
    const [offset, setOffset] = (0, react_1.useState)(0);
    const [totalResults, setTotalResults] = (0, react_1.useState)(0);
    const { settings } = (0, use_settings_1.useSettings)();
    const { isAvailable, error } = (0, use_ai_provider_1.useAiProvider)(settings);
    const [isAiLoading, setIsAiLoading] = (0, react_1.useState)(false);
    const [minLength, setMinLength] = (0, react_1.useState)(50);
    const [maxLength, setMaxLength] = (0, react_1.useState)(10000);
    const [speakers, setSpeakers] = (0, react_1.useState)([]);
    const [selectedSpeakers, setSelectedSpeakers] = (0, react_1.useState)({});
    const [openSpeakers, setOpenSpeakers] = (0, react_1.useState)(false);
    // Chat state
    const [chatMessages, setChatMessages] = (0, react_1.useState)([]);
    const { toast } = (0, use_toast_1.useToast)();
    const [progress, setProgress] = (0, react_1.useState)(0);
    const [floatingInput, setFloatingInput] = (0, react_1.useState)("");
    const [isFloatingInputVisible, setIsFloatingInputVisible] = (0, react_1.useState)(false);
    const floatingInputRef = (0, react_1.useRef)(null);
    const [showScrollButton, setShowScrollButton] = (0, react_1.useState)(false);
    const [isUserScrolling, setIsUserScrolling] = (0, react_1.useState)(false);
    const lastScrollPosition = (0, react_1.useRef)(0);
    const MAX_CONTENT_LENGTH = settings.aiMaxContextChars;
    const [selectedResults, setSelectedResults] = (0, react_1.useState)(new Set());
    const [similarityThreshold, setSimilarityThreshold] = (0, react_1.useState)(1);
    const [hoveredResult, setHoveredResult] = (0, react_1.useState)(null);
    const [isCurlDialogOpen, setIsCurlDialogOpen] = (0, react_1.useState)(false);
    const [isStreaming, setIsStreaming] = (0, react_1.useState)(false);
    const abortControllerRef = (0, react_1.useRef)(null);
    const [selectAll, setSelectAll] = (0, react_1.useState)(true);
    const [showExamples, setShowExamples] = (0, react_1.useState)(true);
    const [hasSearched, setHasSearched] = (0, react_1.useState)(false);
    const [isFiltering, setIsFiltering] = (0, react_1.useState)(false);
    const debouncedThreshold = (0, use_debounce_1.useDebounce)(similarityThreshold, 300);
    const [isQueryParamsDialogOpen, setIsQueryParamsDialogOpen] = (0, react_1.useState)(false);
    // Add state for individual content types
    const [selectedTypes, setSelectedTypes] = (0, react_1.useState)({
        ocr: false,
        audio: false,
        ui: false,
    });
    // Add new state near the top with other state declarations
    const [hideDeselected, setHideDeselected] = (0, react_1.useState)(false);
    const [currentPlatform, setCurrentPlatform] = (0, react_1.useState)(null);
    const [speakerSearchQuery, setSpeakerSearchQuery] = (0, react_1.useState)("");
    const [frameName, setFrameName] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        if (Object.keys(selectedSpeakers).length > 0) {
            setSelectedTypes({
                ocr: false,
                ui: false,
                audio: true,
            });
            setContentType("audio");
        }
    }, [selectedSpeakers]);
    (0, react_1.useEffect)(() => {
        // More reliable OS detection using navigator.userAgentData when available
        if ("userAgentData" in navigator) {
            // @ts-ignore - TypeScript doesn't know about userAgentData yet
            const platform = navigator.userAgent.toLowerCase();
            setCurrentPlatform(platform.includes("mac")
                ? "macos"
                : platform.includes("win")
                    ? "windows"
                    : platform.includes("linux")
                        ? "linux"
                        : "unknown");
        }
        else {
            // Fallback to platform for older browsers
            const platform = window.navigator.platform.toLowerCase();
            setCurrentPlatform(platform.includes("mac")
                ? "macos"
                : platform.includes("win")
                    ? "windows"
                    : platform.includes("linux")
                        ? "linux"
                        : "unknown");
        }
    }, []);
    // Add keyboard shortcut handler
    (0, react_1.useEffect)(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Enter" &&
                ((currentPlatform === "macos" && e.metaKey) ||
                    (currentPlatform !== "macos" && e.ctrlKey))) {
                e.preventDefault();
                handleSearch(0);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentPlatform]);
    const handleSpeakerChange = (speaker) => {
        setSelectedSpeakers((prev) => {
            const newSpeakers = Object.assign(Object.assign({}, prev), { [speaker.id]: speaker });
            if (prev[speaker.id]) {
                delete newSpeakers[speaker.id];
            }
            return newSpeakers;
        });
    };
    (0, react_1.useEffect)(() => {
        if (isQueryParamsDialogOpen && !speakers.length) {
            loadSpeakers();
        }
    }, [isQueryParamsDialogOpen]);
    (0, react_1.useEffect)(() => {
        loadSpeakers();
    }, [speakerSearchQuery]);
    const loadSpeakers = () => __awaiter(this, void 0, void 0, function* () {
        try {
            const getSpeakers = yield fetch(`http://localhost:3030/speakers/search?name=${speakerSearchQuery}`);
            const speakers = yield getSpeakers.json();
            setSpeakers(speakers);
        }
        catch (error) {
            console.error("Error loading speakers:", error);
            setSpeakers([]);
        }
    });
    // Update content type when checkboxes change
    const handleContentTypeChange = (type) => {
        const newTypes = Object.assign(Object.assign({}, selectedTypes), { [type]: !selectedTypes[type] });
        setSelectedTypes(newTypes);
        if (Object.keys(selectedSpeakers).length > 0) {
            setSelectedTypes({
                ocr: false,
                ui: false,
                audio: true,
            });
            setContentType("audio");
        }
        // Convert checkbox state to content type
        if (!newTypes.ocr && !newTypes.audio && !newTypes.ui) {
            setContentType("all"); // fallback to all if nothing selected
        }
        else if (newTypes.audio && newTypes.ui && !newTypes.ocr) {
            setContentType("audio+ui");
        }
        else if (newTypes.ocr && newTypes.ui && !newTypes.audio) {
            setContentType("ocr+ui");
        }
        else if (newTypes.audio && newTypes.ocr && !newTypes.ui) {
            setContentType("audio+ocr");
        }
        else if (newTypes.audio) {
            setContentType("audio");
        }
        else if (newTypes.ocr) {
            setContentType("ocr");
        }
        else if (newTypes.ui) {
            setContentType("ui"); // This was missing - single UI type
        }
        else {
            setContentType("all");
        }
    };
    const handleContentTypeFromFilter = (contentType) => {
        // Update content type
        setContentType(contentType);
        // Update checkbox states based on content type
        setSelectedTypes({
            ocr: contentType.includes("ocr") || contentType === "all",
            audio: contentType.includes("audio") || contentType === "all",
            ui: contentType.includes("ui") || contentType === "all",
        });
    };
    const [selectedAgent, setSelectedAgent] = (0, react_1.useState)(AGENTS[0]);
    (0, react_1.useEffect)(() => {
        const updateDates = () => {
            const now = new Date();
            setEndDate(now);
            // Optionally update startDate if you want to maintain a rolling time window
            // setStartDate(new Date(now.getTime() - 24 * 3600000)); // 24 hours ago
        };
        // Update dates immediately
        updateDates();
        // Set up interval to update dates every 5 minutes
        const intervalId = setInterval(updateDates, 5 * 60 * 1000);
        // Add event listener for when the page becomes visible
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                updateDates();
            }
        });
        // Clean up on component unmount
        return () => {
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", updateDates);
        };
    }, []);
    const isAiDisabled = !((_a = settings.user) === null || _a === void 0 ? void 0 : _a.token) && settings.aiProviderType === "screenpipe-cloud";
    const handleExampleSelect = (example) => __awaiter(this, void 0, void 0, function* () {
        if (isAiDisabled) {
            toast({
                title: "error",
                description: "your selected ai provider is screenpipe-cloud. consider login in app to use screenpipe-cloud",
                variant: "destructive",
            });
            return;
        }
        const newWindowName = example.windowName || "";
        const newAppName = example.appName || "";
        const newLimit = example.limit || limit;
        const newMinLength = example.minLength || minLength;
        const newContentType = example.contentType || contentType;
        const newStartDate = example.startDate;
        setWindowName(newWindowName);
        setAppName(newAppName);
        setLimit(newLimit);
        setMinLength(newMinLength);
        setContentType(newContentType);
        setStartDate(newStartDate);
        setShowExamples(false);
        handleSearch(0, {
            windowName: newWindowName,
            appName: newAppName,
            limit: newLimit,
            minLength: newMinLength,
            contentType: newContentType,
            startDate: newStartDate,
        });
    });
    const generateCurlCommand = () => {
        const baseUrl = "http://localhost:3030";
        const params = {
            content_type: contentType,
            limit: limit.toString(),
            offset: offset.toString(),
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            min_length: minLength.toString(),
            max_length: maxLength.toString(),
            q: query,
            app_name: appName,
            window_name: windowName,
            include_frames: includeFrames ? "true" : undefined,
        };
        const queryParams = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== "")
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join("&");
        return `curl "${baseUrl}/search?${queryParams}" | jq`;
    };
    (0, react_1.useEffect)(() => {
        if (results.length > 0) {
            setSelectedResults(new Set(results.map((_, index) => index)));
            setSelectAll(true);
        }
    }, [results]);
    (0, react_1.useEffect)(() => {
        handleFilterDuplicates();
    }, [debouncedThreshold, results]);
    const handleFilterDuplicates = () => __awaiter(this, void 0, void 0, function* () {
        if (similarityThreshold === 1) {
            setSelectedResults(new Set(results.map((_, index) => index)));
            setSelectAll(true);
            return;
        }
        setIsFiltering(true);
        // simulate a delay to show loading state
        yield new Promise((resolve) => setTimeout(resolve, 100));
        const allIndices = new Set(results.map((_, index) => index));
        setSelectedResults((0, utils_1.removeDuplicateSelections)(results, allIndices, debouncedThreshold));
        setSelectAll(false);
        setIsFiltering(false);
    });
    (0, react_1.useEffect)(() => {
        const handleScroll = () => {
            const currentScrollPosition = window.scrollY;
            const scrollPercentage = (currentScrollPosition /
                (document.documentElement.scrollHeight - window.innerHeight)) *
                100;
            const shouldShow = scrollPercentage < 90; // Show when scrolled up more than 10%
            setShowScrollButton(shouldShow);
            // Check if user is scrolling up while AI is loading
            if (isAiLoading && currentScrollPosition < lastScrollPosition.current) {
                setIsUserScrolling(true);
            }
            lastScrollPosition.current = currentScrollPosition;
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, [isAiLoading]);
    const scrollToBottom = () => {
        if (!isUserScrolling) {
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: "smooth",
            });
        }
    };
    (0, react_1.useEffect)(() => {
        const handleKeyDown = (event) => {
            if (event.key === "/") {
                event.preventDefault();
                setIsFloatingInputVisible(true);
            }
            else if (event.key === "Escape") {
                setIsFloatingInputVisible(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
    (0, react_1.useEffect)(() => {
        if (isFloatingInputVisible && floatingInputRef.current) {
            floatingInputRef.current.focus();
        }
    }, [isFloatingInputVisible]);
    const handleResultSelection = (index) => {
        setSelectedResults((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            }
            else {
                newSet.add(index);
            }
            return newSet;
        });
    };
    const calculateSelectedContentLength = () => {
        return Array.from(selectedResults).reduce((total, index) => {
            const item = results[index];
            if (!item || !item.type)
                return total; // Add this check
            const contentLength = item.type === "OCR"
                ? item.content.text.length
                : item.type === "Audio"
                    ? item.content.transcription.length
                    : item.type === "UI"
                        ? item.content.text.length
                        : 0;
            return total + contentLength;
        }, 0);
    };
    const handleFloatingInputSubmit = (e) => __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        var _d, _e;
        e.preventDefault();
        if (!floatingInput.trim() && !isStreaming)
            return;
        if (isStreaming) {
            handleStopStreaming();
            return;
        }
        scrollToBottom();
        const selectedContentLength = calculateSelectedContentLength();
        if (selectedContentLength > MAX_CONTENT_LENGTH) {
            toast({
                title: "Content too large",
                description: `The selected content length (${selectedContentLength} characters) exceeds the maximum allowed (${MAX_CONTENT_LENGTH} characters). Please unselect some items to reduce the amount of content.`,
                variant: "destructive",
            });
            return;
        }
        const userMessage = {
            id: (0, ai_1.generateId)(),
            role: "user",
            content: floatingInput,
        };
        setChatMessages((prevMessages) => [
            ...prevMessages,
            userMessage,
            { id: (0, ai_1.generateId)(), role: "assistant", content: "" },
        ]);
        setFloatingInput("");
        setIsAiLoading(true);
        try {
            console.log("settings", settings);
            const openai = new openai_1.OpenAI({
                apiKey: settings.aiProviderType === "screenpipe-cloud"
                    ? settings.user.token
                    : settings.openaiApiKey,
                baseURL: settings.aiUrl,
                dangerouslyAllowBrowser: true,
            });
            const model = settings.aiModel;
            const customPrompt = settings.customPrompt || "";
            const messages = [
                {
                    role: "user", // claude does not support system messages?
                    content: `You are a helpful assistant specialized as a "${selectedAgent.name}". ${selectedAgent.systemPrompt}
            Rules:
            - Current time (JavaScript Date.prototype.toString): ${new Date().toString()}
            - User timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
            - User timezone offset: ${new Date().getTimezoneOffset()}
            - ${customPrompt ? `Custom prompt: ${customPrompt}` : ""}
            `,
                },
                ...chatMessages.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                })),
                {
                    role: "user",
                    content: `Context data: ${JSON.stringify(selectedAgent.dataSelector(results.filter((_, index) => selectedResults.has(index))))}

          User query: ${floatingInput}`,
                },
            ];
            console.log("messages", messages);
            abortControllerRef.current = new AbortController();
            setIsStreaming(true);
            const stream = yield openai.chat.completions.create({
                model: model,
                messages: messages,
                stream: true,
            }, {
                signal: abortControllerRef.current.signal,
            });
            let fullResponse = "";
            // @ts-ignore
            setChatMessages((prevMessages) => [
                ...prevMessages.slice(0, -1),
                { id: (0, ai_1.generateId)(), role: "assistant", content: fullResponse },
            ]);
            setIsUserScrolling(false);
            lastScrollPosition.current = window.scrollY;
            scrollToBottom();
            try {
                for (var _f = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _f = true) {
                    _c = stream_1_1.value;
                    _f = false;
                    const chunk = _c;
                    console.log("chunk", chunk);
                    const content = ((_e = (_d = chunk.choices[0]) === null || _d === void 0 ? void 0 : _d.delta) === null || _e === void 0 ? void 0 : _e.content) || "";
                    fullResponse += content;
                    // @ts-ignore
                    setChatMessages((prevMessages) => [
                        ...prevMessages.slice(0, -1),
                        { id: (0, ai_1.generateId)(), role: "assistant", content: fullResponse },
                    ]);
                    scrollToBottom();
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_f && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        catch (error) {
            if (error.toString().includes("unauthorized")) {
                toast({
                    title: "Error",
                    description: "Please sign in to use AI features",
                    variant: "destructive",
                });
            }
            else if (error.toString().includes("aborted")) {
                console.log("Streaming was aborted");
            }
            else {
                console.error("Error generating AI response:", error);
                toast({
                    title: "Error",
                    description: "Failed to generate AI response. Please try again.",
                    variant: "destructive",
                });
            }
        }
        finally {
            setIsAiLoading(false);
            setIsFloatingInputVisible(false);
            setIsStreaming(false);
            if (!isUserScrolling) {
                scrollToBottom();
            }
        }
    });
    const handleStopStreaming = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsStreaming(false);
            setIsAiLoading(false);
        }
    };
    const handleSearch = (...args_1) => __awaiter(this, [...args_1], void 0, function* (newOffset = 0, overrides = {}) {
        var _a;
        if (isAiDisabled) {
            toast({
                title: "error",
                description: "your ai provider is screenpipe-cloud. consider login in app to use screenpipe-cloud",
                duration: 3000,
                variant: "destructive",
            });
            return;
        }
        yield browser_1.pipe.captureMainFeatureEvent("search", {
            contentType: overrides.contentType || contentType,
            limit: overrides.limit || limit,
            offset: newOffset,
            startDate: overrides.startDate || startDate,
        });
        setHasSearched(true);
        setShowExamples(false);
        setIsLoading(true);
        setOffset(newOffset);
        setProgress(0);
        setChatMessages([]);
        scrollToBottom();
        setResults([]);
        setSimilarityThreshold(1); // Reset similarity threshold to 1
        try {
            const searchParams = Object.assign({ q: query || undefined, contentType: overrides.contentType || contentType, limit: overrides.limit || limit, offset: newOffset, startTime: ((_a = overrides.startDate) === null || _a === void 0 ? void 0 : _a.toISOString()) || startDate.toISOString(), endTime: endDate.toISOString(), appName: overrides.appName || appName || undefined, windowName: overrides.windowName || windowName || undefined, includeFrames: includeFrames, minLength: overrides.minLength || minLength, maxLength: maxLength, speakerIds: Object.values(selectedSpeakers).map((speaker) => speaker.id) }, (frameName && { frame_name: frameName }));
            const response = yield browser_1.pipe.queryScreenpipe(searchParams);
            // Add debug logging
            console.log("search response:", response);
            if (!response || !Array.isArray(response.data)) {
                throw new Error("invalid response data");
            }
            setResults(response.data);
            setTotalResults(response.pagination.total);
            // Save search to history
            // await onAddSearch(searchParams, response.data);
        }
        catch (error) {
            console.error("search error:", error);
            toast({
                title: "error",
                description: "failed to fetch search results. please try again.",
                variant: "destructive",
            });
            setResults([]);
            setTotalResults(0);
        }
        finally {
            setIsLoading(false);
        }
    });
    const handleNextPage = () => {
        if (offset + limit < totalResults) {
            handleSearch(offset + limit);
        }
    };
    const handlePrevPage = () => {
        if (offset - limit >= 0) {
            handleSearch(offset - limit);
        }
    };
    const handleBadgeClick = (value, type) => {
        if (type === "app") {
            setAppName(value);
        }
        else if (type === "window") {
            setWindowName(value);
        }
        handleSearch(0);
    };
    const handleSelectAll = (checked) => {
        setSelectAll(checked);
        if (checked) {
            setSelectedResults(new Set(results.map((_, index) => index)));
        }
        else {
            setSelectedResults(new Set());
        }
    };
    const handleQuickTimeFilter = (minutes) => {
        const now = new Date();
        const newStartDate = new Date(now.getTime() - minutes * 60000);
        setStartDate(newStartDate);
        setEndDate(now);
    };
    const renderSearchResults = () => {
        if (isLoading) {
            return Array(3)
                .fill(0)
                .map((_, index) => (<card_1.Card key={index}>
            <card_1.CardContent className="p-4">
              <skeleton_1.Skeleton className="h-4 w-1/4 mb-2"/>
              <skeleton_1.Skeleton className="h-4 w-full mb-2"/>
              <skeleton_1.Skeleton className="h-4 w-full mb-2"/>
              <skeleton_1.Skeleton className="h-4 w-3/4"/>
            </card_1.CardContent>
          </card_1.Card>));
        }
        if (hasSearched && results.length === 0) {
            return <p className="text-center">no results found</p>;
        }
        if (!hasSearched || results.length === 0) {
            return null;
        }
        // First filter results based on hideDeselected setting
        const visibleResults = results
            .map((item, index) => ({ item, originalIndex: index }))
            .filter(({ originalIndex }) => !hideDeselected || selectedResults.has(originalIndex));
        return visibleResults.map(({ item, originalIndex }) => {
            var _a;
            return (<framer_motion_1.motion.div key={originalIndex} className="flex items-center mb-4 relative pl-8">
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2">
          <checkbox_1.Checkbox checked={selectedResults.has(originalIndex)} onCheckedChange={() => handleResultSelection(originalIndex)}/>
        </div>
        <card_1.Card className="w-full">
          <card_1.CardContent className="p-4">
            <accordion_1.Accordion type="single" collapsible className="w-full">
              <accordion_1.AccordionItem value={`item-${originalIndex}`}>
                <accordion_1.AccordionTrigger className="flex flex-col w-full py-2">
                  {/* Main content */}
                  <div className="flex w-full items-center gap-2">
                    <span className="text-left truncate">
                      {item.type === "OCR" &&
                    highlightKeyword(getContextAroundKeyword(item.content.text, query), query)}
                      {item.type === "Audio" &&
                    highlightKeyword(getContextAroundKeyword(item.content.transcription, query), query)}
                      {item.type === "UI" &&
                    highlightKeyword(getContextAroundKeyword(item.content.text, query), query)}
                    </span>
                  </div>
                </accordion_1.AccordionTrigger>
                <accordion_1.AccordionContent>
                  {item.type === "UI" && (<>
                      <div className="max-h-[400px] overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-4">
                        <p className="whitespace-pre-line">
                          {highlightKeyword(item.content.text, query)}
                        </p>
                      </div>
                      <div className="flex justify-center mt-4">
                        <video_1.VideoComponent filePath={item.content.filePath}/>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {item.content.appName && (<badge_1.Badge className="text-xs cursor-pointer" onClick={() => handleBadgeClick(item.content.appName, "app")}>
                            {item.content.appName}
                          </badge_1.Badge>)}
                        {item.content.windowName && (<badge_1.Badge className="text-xs cursor-pointer" onClick={() => handleBadgeClick(item.content.windowName, "window")}>
                            {item.content.windowName}
                          </badge_1.Badge>)}
                      </div>
                    </>)}
                  {item.type === "OCR" && (<>
                      <div className="max-h-[400px] overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-4">
                        <p className="whitespace-pre-line">
                          {highlightKeyword(item.content.text, query)}
                        </p>
                      </div>
                      <div className="flex justify-center mt-4">
                        <video_1.VideoComponent filePath={item.content.filePath}/>
                      </div>
                      {includeFrames && item.content.frame && (<div className="mt-2 flex items-center">
                          <dialog_1.Dialog>
                            <dialog_1.DialogTrigger asChild>
                              <img src={`data:image/jpeg;base64,${item.content.frame}`} alt="Frame" className="w-24 h-auto cursor-pointer"/>
                            </dialog_1.DialogTrigger>
                            <dialog_1.DialogContent className="sm:max-w-[80vw]">
                              <img src={`data:image/jpeg;base64,${item.content.frame}`} alt="Frame" className="w-full h-auto"/>
                            </dialog_1.DialogContent>
                          </dialog_1.Dialog>
                          <tooltip_1.TooltipProvider>
                            <tooltip_1.Tooltip>
                              <tooltip_1.TooltipTrigger asChild>
                                <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help"/>
                              </tooltip_1.TooltipTrigger>
                              <tooltip_1.TooltipContent>
                                <p>this is the frame where the text appeared</p>
                              </tooltip_1.TooltipContent>
                            </tooltip_1.Tooltip>
                          </tooltip_1.TooltipProvider>
                        </div>)}
                    </>)}
                  {item.type === "Audio" && (<>
                      <div className="max-h-[400px] overflow-y-auto rounded border border-gray-100 dark:border-gray-800 p-4">
                        <p className="whitespace-pre-line">
                          {highlightKeyword(item.content.transcription, query)}
                        </p>
                      </div>
                      {item.content.filePath &&
                        item.content.filePath.trim() !== "" ? (<div className="flex justify-center mt-4">
                          <video_1.VideoComponent filePath={item.content.filePath} startTime={item.content.startTime} endTime={item.content.endTime}/>
                        </div>) : (<p className="text-gray-500 italic mt-2">
                          no file path available for this audio.
                        </p>)}
                    </>)}
                </accordion_1.AccordionContent>
              </accordion_1.AccordionItem>
            </accordion_1.Accordion>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <badge_1.Badge variant="outline" className="text-xs">
                {item.type}
              </badge_1.Badge>
              <p className="text-xs text-gray-400">
                {new Date(item.content.timestamp).toLocaleString()}{" "}
                {/* Display local time */}
              </p>
              {item.type === "Audio" && ((_a = item.content.speaker) === null || _a === void 0 ? void 0 : _a.name) && (<p className="text-xs text-gray-400">
                  {item.content.speaker.name}
                </p>)}
              {item.type === "OCR" && item.content.appName && (<div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">app:</span>
                  <badge_1.Badge className="text-xs cursor-pointer" onClick={() => handleBadgeClick(item.content.appName, "app")}>
                    {item.content.appName}
                  </badge_1.Badge>
                </div>)}
              {item.type === "OCR" && item.content.windowName && (<div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">window:</span>
                  <badge_1.Badge className="text-xs cursor-pointer" onClick={() => handleBadgeClick(item.content.windowName, "window")}>
                    {item.content.windowName}
                  </badge_1.Badge>
                </div>)}
              {"tags" in item.content &&
                    item.content.tags &&
                    item.content.tags.map((tag, index) => (<badge_1.Badge key={index} className="text-xs">
                    {tag}
                  </badge_1.Badge>))}
            </div>
          </card_1.CardContent>
        </card_1.Card>
      </framer_motion_1.motion.div>);
        });
    };
    // Add effect to restore search when currentSearchId changes
    (0, react_1.useEffect)(() => {
        // if (currentSearchId) {
        const selectedSearch = searches.find((s) => s.id === currentSearchId);
        if (selectedSearch) {
            // Restore search parameters
            setQuery(selectedSearch.searchParams.q || "");
            setContentType(selectedSearch.searchParams.content_type);
            setLimit(selectedSearch.searchParams.limit);
            setStartDate(new Date(selectedSearch.searchParams.start_time));
            setEndDate(new Date(selectedSearch.searchParams.end_time));
            setAppName(selectedSearch.searchParams.app_name || "");
            setWindowName(selectedSearch.searchParams.window_name || "");
            setIncludeFrames(selectedSearch.searchParams.include_frames);
            setMinLength(selectedSearch.searchParams.min_length);
            setMaxLength(selectedSearch.searchParams.max_length);
            // Restore results
            setResults(selectedSearch.results);
            setTotalResults(selectedSearch.results.length);
            setHasSearched(true);
            setShowExamples(false);
            // Restore messages if any
            if (selectedSearch.messages) {
                setChatMessages(selectedSearch.messages.map((msg) => ({
                    id: msg.id,
                    role: msg.type === "ai" ? "assistant" : "user",
                    content: msg.content,
                })));
            }
        }
        // }
    }, [currentSearchId, searches]);
    const handleNewSearch = () => {
        // setCurrentSearchId(null);
        location.reload();
        // Add any other reset logic you need
    };
    // Add this effect near other useEffect hooks
    (0, react_1.useEffect)(() => {
        const handleKeyDown = (e) => {
            // Check for Cmd+Shift (macOS) or Ctrl+Shift (Windows/Linux)
            if (e.shiftKey &&
                ((currentPlatform === "macos" && e.metaKey) ||
                    (currentPlatform !== "macos" && e.ctrlKey)) &&
                !e.altKey && // ensure alt/option isn't pressed
                !e.key.match(/^[a-zA-Z0-9]$/) // prevent triggering on letter/number keys
            ) {
                e.preventDefault();
                if (floatingInputRef.current && results.length > 0) {
                    handleFloatingInputSubmit(new Event("submit"));
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentPlatform, results.length, floatingInput, isStreaming]);
    return (<div className="w-full max-w-4xl mx-auto p-4 mt-12">
      <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
        {/* <SidebarTrigger className="h-8 w-8" /> */}
        <button_1.Button variant="ghost" size="icon" onClick={handleNewSearch} className="h-8 w-8">
          <lucide_react_1.Plus className="h-4 w-4"/>
        </button_1.Button>
      </div>

      <div className="flex items-center justify-center mb-16">
        {/* Add the new SearchFilterGenerator component */}
        <search_filter_generator_1.SearchFilterGenerator onApplyFilters={(filters) => {
            var _a, _b, _c, _d, _e, _f, _g;
            // Always use empty string instead of undefined for text inputs
            setQuery((_a = filters.query) !== null && _a !== void 0 ? _a : "");
            setAppName((_b = filters.appName) !== null && _b !== void 0 ? _b : "");
            setWindowName((_c = filters.windowName) !== null && _c !== void 0 ? _c : "");
            // Use default values for other types
            handleContentTypeFromFilter((_d = filters.contentType) !== null && _d !== void 0 ? _d : "all");
            setStartDate((_e = filters.startDate) !== null && _e !== void 0 ? _e : new Date(Date.now() - 24 * 3600000));
            setEndDate((_f = filters.endDate) !== null && _f !== void 0 ? _f : new Date());
            setLimit((_g = filters.limit) !== null && _g !== void 0 ? _g : 30);
            // Automatically perform search with new filters
            handleSearch(0);
        }}/>
      </div>
      {/* Content Type Checkboxes and Code Button */}
      <div className="flex items-center justify-center mb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <checkbox_1.Checkbox id="audio-type" checked={selectedTypes.audio} onCheckedChange={() => handleContentTypeChange("audio")} className="h-4 w-4"/>

              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <label_1.Label htmlFor="audio-type" className="text-xs">
                      speech
                    </label_1.Label>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>audio transcripts</p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
            {currentPlatform === "macos" && (<div className="flex items-center space-x-1">
                <checkbox_1.Checkbox id="ui-type" checked={selectedTypes.ui} onCheckedChange={() => handleContentTypeChange("ui")} className="h-4 w-4"/>

                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip>
                    <tooltip_1.TooltipTrigger asChild>
                      <label_1.Label htmlFor="ui-type" className="text-xs">
                        screen UI
                      </label_1.Label>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent>
                      <p>
                        text emitted directly from the source code of the
                        desktop applications
                      </p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
              </div>)}
            <div className="flex items-center space-x-1">
              <checkbox_1.Checkbox id="ocr-type" checked={selectedTypes.ocr} onCheckedChange={() => handleContentTypeChange("ocr")} className="h-4 w-4"/>

              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <label_1.Label htmlFor="ocr-type" className="text-xs">
                      screen capture
                    </label_1.Label>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>
                      recognized text from screenshots taken every 5s by default
                    </p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
          </div>
        </div>
      </div>

      {/* Existing search bar and other controls */}
      <div className="flex items-center gap-4 mb-4">
        {/* Keyword search - smaller width */}
        <input_1.Input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter") {
                handleSearch(0);
            }
        }} placeholder="keyword search, you may leave it blank" className="w-[350px]" autoCorrect="off" autoComplete="off"/>

        {/* Window name filter - increased width */}
        <sql_autocomplete_input_1.SqlAutocompleteInput id="window-name" type="window" value={windowName} onChange={setWindowName} placeholder="filter by window" className="w-[300px]" icon={<lucide_react_1.Layout className="h-4 w-4"/>}/>

        {/* Advanced button */}
        <button_1.Button variant="outline" onClick={() => setIsQueryParamsDialogOpen(true)}>
          <lucide_react_1.Settings className="h-4 w-4"/>
        </button_1.Button>

        <tooltip_1.TooltipProvider>
          <tooltip_1.Tooltip>
            <tooltip_1.TooltipTrigger asChild>
              <span>
                <button_1.Button onClick={() => handleSearch(0)} disabled={isLoading ||
            isAiDisabled ||
            !health ||
            (health === null || health === void 0 ? void 0 : health.status) === "error"} className="disabled:cursor-not-allowed">
                  {isLoading ? (<>
                      <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                      searching...
                    </>) : (<>
                      <lucide_react_1.Search className="mr-2 h-4 w-4"/>
                      {currentPlatform === "macos" ? "⌘" : "ctrl"} + ↵
                    </>)}
                </button_1.Button>
              </span>
            </tooltip_1.TooltipTrigger>
            {(!health || (health === null || health === void 0 ? void 0 : health.status) === "error" || isAiDisabled) && (<tooltip_1.TooltipContent>
                <p>
                  {isAiDisabled && isServerDown ? (<>
                      <lucide_react_1.AlertCircle className="mr-1 h-4 w-4 text-red-500 inline"/>
                      you don't have access to screenpipe-cloud <br /> and
                      screenpipe server is down!
                    </>) : isServerDown ? (<>
                      <lucide_react_1.AlertCircle className="mr-1 h-4 w-4 text-red-500 inline"/>
                      screenpipe is not running...
                    </>) : isAiDisabled ? (<>
                      <lucide_react_1.AlertCircle className="mr-1 h-4 w-4 text-red-500 inline"/>
                      you don't have access to screenpipe-cloud :( <br /> please
                      consider login!
                    </>) : ("")}
                </p>
              </tooltip_1.TooltipContent>)}
          </tooltip_1.Tooltip>
        </tooltip_1.TooltipProvider>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex-grow space-y-2">
          <div className="flex items-center space-x-2">
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <label_1.Label htmlFor="start-date">start date</label_1.Label>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>select the start date to search for content</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>
          <date_time_picker_1.DateTimePicker date={startDate} setDate={setStartDate} className="w-full"/>
        </div>

        <div className="flex-grow space-y-2">
          <div className="flex items-center space-x-2">
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <label_1.Label htmlFor="end-date">end date</label_1.Label>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>select the end date to search for content</p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>
          <date_time_picker_1.DateTimePicker date={endDate} setDate={setEndDate} className="w-full"/>
        </div>
      </div>

      <div className="flex mt-4 space-x-2 justify-center">
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(30)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 30m
        </badge_1.Badge>
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(60)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 60m
        </badge_1.Badge>
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(24 * 60)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 24h
        </badge_1.Badge>
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(7 * 24 * 60)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 7d
        </badge_1.Badge>
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(30 * 24 * 60)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 30d
        </badge_1.Badge>
      </div>

      <dialog_1.Dialog open={isQueryParamsDialogOpen} onOpenChange={setIsQueryParamsDialogOpen}>
        <dialog_1.DialogContent className="sm:max-w-[605px] max-h-[80vh] overflow-y-auto">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle>advanced search parameters</dialog_1.DialogTitle>
            <dialog_1.DialogDescription>
              adjust additional search parameters here.
            </dialog_1.DialogDescription>
          </dialog_1.DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Add the curl command button at the top */}
            <div className="flex justify-end">
              <dialog_1.Dialog>
                <dialog_1.DialogTrigger asChild>
                  <button_1.Button variant="outline" className="text-sm">
                    <icons_1.IconCode className="h-4 w-4 mx-2"/>
                    curl command
                  </button_1.Button>
                </dialog_1.DialogTrigger>
                <dialog_1.DialogContent className="max-w-2xl">
                  <dialog_1.DialogHeader>
                    <dialog_1.DialogTitle>curl command</dialog_1.DialogTitle>
                    <dialog_1.DialogDescription>
                      you can use this curl command to make the same search
                      request from the command line.
                      <br />
                      <br />
                      <span className="text-xs text-gray-500">
                        note: you need to have `jq` installed to use the
                        command.
                      </span>{" "}
                    </dialog_1.DialogDescription>
                  </dialog_1.DialogHeader>
                  <div className="overflow-x-auto">
                    <codeblock_1.CodeBlock language="bash" value={generateCurlCommand()}/>
                  </div>
                </dialog_1.DialogContent>
              </dialog_1.Dialog>
            </div>

            {/* Rest of the advanced settings content */}
            <div className="grid grid-cols-4 items-center gap-4">
              <label_1.Label htmlFor="app-name" className="text-right">
                app name
              </label_1.Label>
              <div className="col-span-3 flex items-center">
                <sql_autocomplete_input_1.SqlAutocompleteInput id="app-name" type="app" icon={<lucide_react_1.Laptop className="h-4 w-4"/>} value={appName} onChange={setAppName} placeholder="filter by app name" className="flex-grow"/>
                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip>
                    <tooltip_1.TooltipTrigger asChild>
                      <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help"/>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent>
                      <p>filter results by specific application names</p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label_1.Label htmlFor="min-length" className="text-right">
                min length
              </label_1.Label>
              <div className="col-span-3 flex items-center">
                <input_1.Input id="min-length" type="number" value={minLength} onChange={(e) => setMinLength(Number(e.target.value))} className="flex-grow"/>
                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip>
                    <tooltip_1.TooltipTrigger asChild>
                      <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help"/>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent>
                      <p>
                        enter the minimum length of the content to search for
                        <br />
                        usually transcriptions are short while text extracted
                        from images can be long.
                      </p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label_1.Label htmlFor="max-length" className="text-right">
                max length
              </label_1.Label>
              <div className="col-span-3 flex items-center">
                <input_1.Input id="max-length" type="number" value={maxLength} onChange={(e) => setMaxLength(Number(e.target.value))} className="flex-grow"/>
                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip>
                    <tooltip_1.TooltipTrigger asChild>
                      <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help"/>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent>
                      <p>
                        enter the maximum length of the content to search for
                      </p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <label_1.Label htmlFor="limit-slider" className="text-right">
                page size: {limit}
              </label_1.Label>
              <div className="col-span-3 flex items-center">
                <slider_1.Slider id="limit-slider" value={[limit]} onValueChange={(value) => setLimit(value[0])} min={10} max={15000} step={10} className="flex-grow"/>
                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip>
                    <tooltip_1.TooltipTrigger asChild>
                      <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help"/>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent>
                      <p>
                        select the number of results to display. usually ai
                        cannot ingest more than 30 OCR results at a time and
                        1000 audio results at a time.
                      </p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <label_1.Label htmlFor="speakers" className="text-right">
              speakers
            </label_1.Label>
            <div className="col-span-3 flex items-center">
              <popover_1.Popover open={openSpeakers} onOpenChange={setOpenSpeakers}>
                <popover_1.PopoverTrigger asChild>
                  <button_1.Button variant="outline" role="combobox" aria-expanded={openSpeakers} className="w-full justify-between">
                    {Object.values(selectedSpeakers).length > 0
            ? `${Object.values(selectedSpeakers)
                .map((s) => s.name)
                .join(", ")}`
            : "select speakers"}
                    <lucide_react_1.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                  </button_1.Button>
                </popover_1.PopoverTrigger>
                <popover_1.PopoverContent className="w-[350px] p-0">
                  <command_1.Command>
                    <command_1.CommandInput placeholder="search speakers..." value={speakerSearchQuery} onValueChange={setSpeakerSearchQuery}/>
                    <command_1.CommandList>
                      <command_1.CommandEmpty>no speakers found.</command_1.CommandEmpty>
                      <command_1.CommandGroup>
                        {[...new Set(speakers)].map((speaker) => (<command_1.CommandItem key={speaker.id} value={speaker.name} onSelect={() => handleSpeakerChange(speaker)}>
                            <div className="flex items-center">
                              <lucide_react_1.Check className={(0, utils_1.cn)("mr-2 h-4 w-4", selectedSpeakers[speaker.id]
                ? "opacity-100"
                : "opacity-0")}/>
                              <span style={{
                userSelect: "none",
                WebkitUserSelect: "none",
                MozUserSelect: "none",
                msUserSelect: "none",
            }}>
                                {speaker.name}
                              </span>
                            </div>
                          </command_1.CommandItem>))}
                      </command_1.CommandGroup>
                    </command_1.CommandList>
                  </command_1.Command>
                </popover_1.PopoverContent>
              </popover_1.Popover>
            </div>
          </div>
          {/* Add frame name input after app name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label_1.Label htmlFor="frame-name" className="text-right">
              frame name
            </label_1.Label>
            <div className="col-span-3 flex items-center">
              <input_1.Input id="frame-name" type="text" value={frameName} onChange={(e) => setFrameName(e.target.value)} placeholder="filter by frame name" className="flex-grow"/>
              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 ml-2 cursor-help"/>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>
                      filter results by specific frame names (by default frame
                      name is mp4 video file path)
                    </p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
          </div>
          <div className="flex items-center justify-center space-x-2">
            <switch_1.Switch id="include-frames" checked={includeFrames} onCheckedChange={setIncludeFrames}/>
            <label_1.Label htmlFor="include-frames">include frames</label_1.Label>
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 cursor-help"/>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent>
                  <p>
                    include frames in the search results. this shows the frame
                    where the text appeared. only works for ocr. this may slow
                    down the search.
                  </p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </div>
          <dialog_1.DialogFooter>
            <button_1.Button onClick={() => setIsQueryParamsDialogOpen(false)}>
              done
            </button_1.Button>
          </dialog_1.DialogFooter>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>

      {isLoading ? (<div className="my-8 flex justify-center">
          <lucide_react_1.Loader2 className="h-8 w-8 animate-spin"/>
        </div>) : (showExamples &&
            results.length === 0 && (<div className="my-8 flex justify-center">
            <example_search_cards_1.ExampleSearchCards onSelect={handleExampleSelect}/>
          </div>))}
      {isLoading && (<div className="my-2">
          <progress_1.Progress value={progress} className="w-full"/>
        </div>)}
      {results.length > 0 && (<div className="flex flex-col space-y-4 mb-4 my-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <checkbox_1.Checkbox id="select-all" checked={selectAll} onCheckedChange={handleSelectAll}/>
                <label_1.Label htmlFor="select-all">select all results</label_1.Label>
              </div>

              <separator_1.Separator orientation="vertical" className="h-4"/>

              <div className="flex items-center space-x-2">
                <switch_1.Switch id="hide-deselected" checked={hideDeselected} onCheckedChange={setHideDeselected}/>
                <label_1.Label htmlFor="hide-deselected">hide unselected</label_1.Label>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button_1.Button variant="outline" size="sm" onClick={() => {
                setSimilarityThreshold(similarityThreshold === 0.5 ? 1 : 0.5);
                if (similarityThreshold === 0.5) {
                    setSelectedResults(new Set(results.map((_, index) => index)));
                    setSelectAll(true);
                }
            }} disabled={isFiltering} className="flex items-center gap-2 disabled:opacity-100">
                {isFiltering ? (<lucide_react_1.Loader2 className="h-4 w-4 animate-spin"/>) : similarityThreshold === 0.5 ? (<lucide_react_1.Check className="h-4 w-4"/>) : (<lucide_react_1.Layers className="h-4 w-4"/>)}
                {similarityThreshold === 0.5
                ? "duplicates removed"
                : "remove duplicates"}
              </button_1.Button>

              <tooltip_1.TooltipProvider>
                <tooltip_1.Tooltip>
                  <tooltip_1.TooltipTrigger asChild>
                    <lucide_react_1.HelpCircle className="h-4 w-4 text-gray-400 cursor-help"/>
                  </tooltip_1.TooltipTrigger>
                  <tooltip_1.TooltipContent>
                    <p>automatically unselect similar or duplicate results</p>
                  </tooltip_1.TooltipContent>
                </tooltip_1.Tooltip>
              </tooltip_1.TooltipProvider>
            </div>
          </div>
        </div>)}
      <div className="space-y-4">
        {renderSearchResults()}
        {totalResults > 0 && (<div className="flex justify-between items-center mt-4">
            <button_1.Button onClick={handlePrevPage} disabled={offset === 0} variant="outline" size="sm">
              <lucide_react_1.ChevronLeft className="mr-2 h-4 w-4"/> Previous
            </button_1.Button>
            <span className="text-sm text-gray-500">
              Showing {offset + 1} - {Math.min(offset + limit, totalResults)} of{" "}
              {totalResults}
            </span>
            <button_1.Button onClick={handleNextPage} disabled={offset + limit >= totalResults} variant="outline" size="sm">
              Next <lucide_react_1.ChevronRight className="ml-2 h-4 w-4"/>
            </button_1.Button>
          </div>)}
      </div>

      <framer_motion_1.AnimatePresence>
        {results.length > 0 && (<framer_motion_1.motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-4 left-0 right-0 mx-auto w-full max-w-2xl z-50">
            <form onSubmit={handleFloatingInputSubmit} className="flex flex-col space-y-2 bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden p-4 border border-gray-200 dark:border-gray-700">
              <div className="relative flex-grow flex items-center space-x-2">
                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip>
                    <tooltip_1.TooltipTrigger>
                      <div className="text-muted-foreground">
                        <lucide_react_1.Bot className="h-4 w-4 mr-2"/>
                      </div>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent>
                      <p>using {settings.aiModel}</p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip open={!isAvailable}>
                    <tooltip_1.TooltipTrigger asChild>
                      <div className="flex-1">
                        <input_1.Input ref={floatingInputRef} type="text" placeholder="ask a question about the results..." value={floatingInput} disabled={calculateSelectedContentLength() >
                MAX_CONTENT_LENGTH ||
                isAiDisabled ||
                !isAvailable} onChange={(e) => setFloatingInput(e.target.value)} className="flex-1 h-12 focus:outline-none focus:ring-0 border-0 focus:border-black dark:focus:border-white focus:border-b transition-all duration-200"/>
                      </div>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent side="top">
                      <p className="text-sm text-destructive">{error}</p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
                <select_1.Select value={selectedAgent.id} onValueChange={(value) => setSelectedAgent(AGENTS.find((a) => a.id === value) || AGENTS[0])}>
                  <select_1.SelectTrigger className="w-[170px] h-12" title={selectedAgent.description}>
                    <select_1.SelectValue placeholder="select agent"/>
                  </select_1.SelectTrigger>
                  <select_1.SelectContent>
                    {AGENTS.map((agent) => {
                var _a;
                return (<select_1.SelectItem key={agent.id} value={agent.id} title={(_a = AGENTS.find((a) => a.id === agent.id)) === null || _a === void 0 ? void 0 : _a.description}>
                        <span className="font-mono text-sm">{agent.name}</span>
                      </select_1.SelectItem>);
            })}
                  </select_1.SelectContent>
                </select_1.Select>

                <button_1.Button type="submit" className="w-12" disabled={calculateSelectedContentLength() > MAX_CONTENT_LENGTH ||
                isAiDisabled} title={isAiDisabled
                ? "Please sign in to use AI features"
                : `${currentPlatform === "macos" ? "⌘" : "ctrl"}+shift`}>
                  {isStreaming ? (<lucide_react_1.Square className="h-4 w-4"/>) : (<div className="flex items-center">
                      <lucide_react_1.Send className="h-4 w-4"/>
                      <span className="sr-only">
                        {currentPlatform === "macos" ? "⌘" : "ctrl"}+shift
                      </span>
                    </div>)}
                </button_1.Button>

                <tooltip_1.TooltipProvider>
                  <tooltip_1.Tooltip>
                    <tooltip_1.TooltipTrigger asChild>
                      <span>
                        <context_usage_indicator_1.ContextUsageIndicator currentSize={calculateSelectedContentLength()} maxSize={MAX_CONTENT_LENGTH}/>
                      </span>
                    </tooltip_1.TooltipTrigger>
                    <tooltip_1.TooltipContent>
                      <p className="text-sm">
                        {calculateSelectedContentLength() > MAX_CONTENT_LENGTH
                ? `selected content exceeds maximum allowed: ${calculateSelectedContentLength()} / ${MAX_CONTENT_LENGTH} characters. unselect some items to use AI.`
                : `${calculateSelectedContentLength()} / ${MAX_CONTENT_LENGTH} characters used for AI message`}
                        <br />
                        <span className="text-muted-foreground mt-1 block">
                          ai models can only process a limited amount of text at
                          once. the circle indicates your current usage.
                        </span>
                      </p>
                    </tooltip_1.TooltipContent>
                  </tooltip_1.Tooltip>
                </tooltip_1.TooltipProvider>
              </div>
            </form>
          </framer_motion_1.motion.div>)}
      </framer_motion_1.AnimatePresence>

      {results.length > 0 && <separator_1.Separator className="my-8"/>}

      {/* Display chat messages - Update this section */}
      {(chatMessages.length > 0 || isAiLoading) && (<>
          <div className="flex flex-col items-start flex-1 max-w-2xl gap-8 px-4 mx-auto">
            {chatMessages.map((msg, index) => (<chat_message_1.ChatMessage key={index} message={msg}/>))}
            {isAiLoading && spinner_1.spinner}
          </div>
        </>)}

      {/* Scroll to Bottom Button */}
      {showScrollButton && (<button_1.Button className="fixed bottom-4 right-4 rounded-full p-2" onClick={scrollToBottom}>
          <lucide_react_1.ChevronDown className="h-6 w-6"/>
        </button_1.Button>)}
      {results.length > 0 && <div className="h-32"/>}
    </div>);
}
