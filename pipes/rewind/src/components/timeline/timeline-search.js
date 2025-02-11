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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineSearch = TimelineSearch;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const button_1 = require("@/components/ui/button");
const input_1 = require("@/components/ui/input");
const dialog_1 = require("@/components/ui/dialog");
const framer_motion_1 = require("framer-motion");
const openai_1 = __importDefault(require("openai"));
const use_settings_1 = require("@/lib/hooks/use-settings");
const tooltip_1 = require("@/components/ui/tooltip");
function isValidSearchParams(obj) {
    return (obj &&
        typeof obj === "object" &&
        Array.isArray(obj.keywords) &&
        obj.keywords.every((keyword) => typeof keyword === "string"));
}
function validateFrameContext(frames, centerIndex, searchParams, openai, model, systemPrompt) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        console.log("validating context for frame:", {
            centerIndex,
            searchParams,
            model,
        });
        const windowSize = 1000;
        const start = Math.max(0, centerIndex - windowSize);
        const end = Math.min(frames.length - 1, centerIndex + windowSize);
        const contextFrames = frames.slice(start, end + 1);
        const contextData = contextFrames.map((frame) => ({
            ocr: frame.devices.map((d) => d.metadata.ocr_text || "").join(" "),
            transcripts: frame.devices
                .flatMap((d) => d.audio.map((a) => a.transcription || ""))
                .join(" "),
            apps: frame.devices.map((d) => d.metadata.app_name || "").join(", "),
            windows: frame.devices.map((d) => d.metadata.window_name || "").join(", "),
        }));
        console.log("context data being sent to AI:", contextData);
        const response = yield openai.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: `given the search parameters: ${JSON.stringify(searchParams)}
        and these surrounding frames: ${JSON.stringify(contextData)}
        
        determine if this is truly a relevant match.
        output format: {
          "isRelevant": boolean,
          "confidence": number, // 0-1
          "reason": string // brief explanation
        }`,
                },
            ],
            response_format: { type: "json_object" },
        });
        console.log("validation response from AI:", (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content);
        if (!((_e = (_d = (_c = response.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content)) {
            throw new Error("invalid or empty response from ai:" + JSON.stringify(response, null, 2));
        }
        return JSON.parse(response.choices[0].message.content);
    });
}
function findRelevantFrame(query_1, frames_1, openai_2, model_1, onProgress_1, systemPrompt_1) {
    return __awaiter(this, arguments, void 0, function* (query, frames, openai, model, onProgress, systemPrompt, recursionDepth = 0, previousValidation, signal) {
        var _a, _b, _c, _d, _e;
        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
            throw new Error("AbortError");
        }
        console.log("starting search with:", {
            query,
            model,
            recursionDepth,
            previousValidation,
        });
        // prevent infinite recursion
        if (recursionDepth >= 2) {
            return null;
        }
        onProgress("analyzing your search query to understand what to look for...");
        // enhance query with previous validation feedback
        const enhancedQuery = previousValidation
            ? `${query} (considering: ${previousValidation.reason})`
            : query;
        try {
            const response = yield openai.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt,
                    },
                    {
                        role: "user",
                        content: `analyze this search query and extract key information: "${enhancedQuery}"
          output format: {
            "keywords": string[] // important keywords to match, must be non-empty array
          }
          
          for example, if the user asks "when i was doing annual reflections in obsidian", the output should be:
          {
            "keywords": ["obsidian", "annual reflections"]
          }
          
          if the user asks "when i was watching a youtube video about rust", the output should be:
          {
            "keywords": ["youtube", "rust", "video"]
          }
          `,
                    },
                ],
                response_format: { type: "json_object" },
            });
            console.log("search params response from AI:", (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content);
            if (!((_e = (_d = (_c = response.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content)) {
                throw new Error("invalid or empty response from ai:" + JSON.stringify(response, null, 2));
            }
            const jsonContent = response.choices[0].message.content;
            const parsed = JSON.parse(jsonContent);
            console.log("parsed search params:", parsed);
            if (!isValidSearchParams(parsed)) {
                throw new Error("invalid or malformed search parameters from ai response");
            }
            const searchParams = parsed;
            onProgress(`searching for moments containing: ${searchParams.keywords.join(", ")}...`);
            yield new Promise((resolve) => setTimeout(resolve, 1000));
            // Add early return after checking N frames
            const MAX_FRAMES_TO_CHECK = 1000; // Adjust this number
            let framesChecked = 0;
            const BATCH_SIZE = 2000; // Adjust based on performance needs
            for (let i = 0; i < frames.length; i += BATCH_SIZE) {
                if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                    throw new Error("AbortError");
                }
                if (framesChecked >= MAX_FRAMES_TO_CHECK) {
                    onProgress("reached search limit. try being more specific.");
                    return null;
                }
                // Process frames in batches
                const batchFrames = frames.slice(i, i + BATCH_SIZE);
                const potentialMatches = [];
                // First pass: quick keyword matching on the batch
                batchFrames.forEach((frame, batchIndex) => {
                    const globalIndex = i + batchIndex;
                    const hasMatch = frame.devices.some((device) => searchParams.keywords.some((keyword) => {
                        var _a, _b, _c;
                        const keywordLower = keyword.toLowerCase();
                        return (((_a = device.metadata.app_name) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(keywordLower)) ||
                            ((_b = device.metadata.window_name) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(keywordLower)) ||
                            ((_c = device.metadata.ocr_text) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes(keywordLower)) ||
                            device.audio.some((a) => { var _a; return (_a = a.transcription) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(keywordLower); }));
                    }));
                    if (hasMatch) {
                        potentialMatches.push(globalIndex);
                    }
                });
                // If we found matches in this batch, validate them
                if (potentialMatches.length > 0) {
                    onProgress(`found ${potentialMatches.length} potential matches, analyzing context...`);
                    // Validate the most promising matches first (you could add scoring here)
                    for (const matchIndex of potentialMatches) {
                        const validation = yield validateFrameContext(frames, matchIndex, searchParams, openai, model, systemPrompt);
                        if (validation.isRelevant && validation.confidence > 0.7) {
                            onProgress(`found a highly relevant match! jumping to that moment...`);
                            return matchIndex;
                        }
                    }
                    framesChecked += potentialMatches.length;
                    console.log("frames checked:", framesChecked);
                }
            }
            onProgress(`couldn't find an exact match. try being more specific about the app or content you're looking for.`);
            return null;
        }
        catch (error) {
            if (error.includes("AbortError")) {
                console.log("search aborted");
            }
            else {
                console.error("search parameter parsing error:", error);
                onProgress(`oops! something went wrong with the search. please try again.`);
            }
            throw new Error(`failed to parse search parameters: ${error}`);
        }
    });
}
function generateSuggestions(openai, model, systemPrompt, appStats) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log("generating suggestions with stats:", {
            model,
            appStats,
        });
        try {
            const response = yield openai.chat.completions.create({
                model,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt,
                    },
                    {
                        role: "user",
                        content: `generate 5 natural search suggestions based on the most common apps and activities in the user's data.
          use this app statistics:
          apps: ${JSON.stringify(appStats.apps)}
          windows: ${JSON.stringify(appStats.windows)}
          
          output format: {
            "suggestions": string[] // array of 5 natural language search queries
          }
          
          make them specific and varied, focusing on different types of activities.
          example output:
          {
            "suggestions": [
              "when i was coding rust in vscode yesterday",
              "that meeting about product roadmap in google meet",
              "when i was watching youtube tutorials about typescript",
              "my obsidian notes about system design",
              "that time i was debugging in chrome devtools"
            ]
          }`,
                    },
                ],
                response_format: { type: "json_object" },
            });
            console.log("suggestions response from AI:", response);
            if (!((_c = (_b = (_a = response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content)) {
                throw new Error("invalid or empty response from ai");
            }
            const parsed = JSON.parse(response.choices[0].message.content);
            return parsed.suggestions || [];
        }
        catch (error) {
            console.warn("failed to generate suggestions:", error);
            return [
                "when i was coding in vscode",
                "that meeting in google meet",
                "when i opened figma",
                "that youtube video about rust",
                "when i was writing in notion",
            ];
        }
    });
}
const CACHE_KEY = "timeline_search_suggestions";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
function generateAppsHash(appStats) {
    // create a hash of top 5 apps to detect major changes
    const topApps = Object.entries(appStats.apps)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([app]) => app)
        .join("|");
    return topApps;
}
function getCachedOrGenerateSuggestions(openai, model, systemPrompt, appStats) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsedCache = JSON.parse(cached);
                const isExpired = Date.now() - parsedCache.timestamp > CACHE_DURATION_MS;
                const appsChanged = generateAppsHash(appStats) !== parsedCache.appsHash;
                if (!isExpired && !appsChanged) {
                    console.log("using cached suggestions");
                    return parsedCache.suggestions;
                }
            }
            const suggestions = yield generateSuggestions(openai, model, systemPrompt, appStats);
            // cache the new suggestions
            const cacheData = {
                suggestions,
                timestamp: Date.now(),
                appsHash: generateAppsHash(appStats),
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            return suggestions;
        }
        catch (error) {
            console.warn("failed to handle suggestions:", error);
            return [
                "when i was coding in vscode",
                "that meeting in google meet",
                "when i opened figma",
                "that youtube video about rust",
                "when i was writing in notion",
            ];
        }
    });
}
function TimelineSearch({ frames, onResultSelect, }) {
    const [open, setOpen] = (0, react_1.useState)(false);
    const [searchQuery, setSearchQuery] = (0, react_1.useState)("");
    const [searchStatus, setSearchStatus] = (0, react_1.useState)("");
    const [isSearching, setIsSearching] = (0, react_1.useState)(false);
    const { settings } = (0, use_settings_1.useSettings)();
    const [suggestions, setSuggestions] = (0, react_1.useState)(null);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = (0, react_1.useState)(false);
    const hasLoadedSuggestions = (0, react_1.useRef)(false);
    const [abortController, setAbortController] = (0, react_1.useState)(null);
    // Compute app statistics once when component mounts or frames update
    const appStats = (0, react_1.useMemo)(() => {
        const stats = {
            apps: {},
            windows: {},
            maxItems: 10, // Keep top N most common
        };
        frames.forEach((frame) => {
            frame.devices.forEach((device) => {
                if (device.metadata.app_name) {
                    stats.apps[device.metadata.app_name] =
                        (stats.apps[device.metadata.app_name] || 0) + 1;
                }
                if (device.metadata.window_name) {
                    stats.windows[device.metadata.window_name] =
                        (stats.windows[device.metadata.window_name] || 0) + 1;
                }
            });
        });
        // Sort and keep only top N
        const topApps = Object.entries(stats.apps)
            .sort(([, a], [, b]) => b - a)
            .slice(0, stats.maxItems)
            .reduce((obj, [key, val]) => (Object.assign(Object.assign({}, obj), { [key]: val })), {});
        const topWindows = Object.entries(stats.windows)
            .sort(([, a], [, b]) => b - a)
            .slice(0, stats.maxItems)
            .reduce((obj, [key, val]) => (Object.assign(Object.assign({}, obj), { [key]: val })), {});
        return Object.assign(Object.assign({}, stats), { apps: topApps, windows: topWindows });
    }, [frames]);
    // Generate system prompt with app statistics
    const getSystemPrompt = (0, react_1.useCallback)(() => {
        const appsList = Object.entries(appStats.apps)
            .map(([app, count]) => `${app} (${count} occurrences)`)
            .join(", ");
        const windowsList = Object.entries(appStats.windows)
            .map(([window, count]) => `${window} (${count} occurrences)`)
            .join(", ");
        return `you are a search assistant for screenpipe, a system that continuously records screens & mics.

your task is to analyze search queries and extract key information to find specific moments in the timeline.
be extremely strict about matches - all keywords must be present in the correct context.

common applications in user's data:
${appsList}

common window titles:
${windowsList}

the data you're searching through includes:
- screen content (OCR text)
- audio transcriptions
- application names
- window titles
- device metadata

each frame contains:
- timestamp
- multiple devices data
- metadata (ocr_text, app_name, window_name)
- audio transcriptions

search guidelines:
1. all keywords must be present in the same timeframe or adjacent frames
2. context must match exactly (e.g. if searching for "coding db.rs in cursor", must find frames where:
   - app_name contains "cursor"
   - window_name or ocr_text contains "db.rs"
   - there's evidence of active coding)
3. temporal context matters (e.g. "last time" means most recent match)
4. activity context matters (e.g. "coding" requires code editor, relevant window titles)

examples of strict matching:
- query: "coding db.rs in cursor"
  ✓ good match: {app_name: "Cursor", window_name: "db.rs - screenpipe", ocr_text: "fn main() {..."}
  ✗ bad match: {app_name: "Cursor", window_name: "meeting notes", ocr_text: "discussing db.rs"}

- query: "watching rust video on youtube" 
  ✓ good match: {app_name: "Chrome", window_name: "Rust Tutorial - YouTube", transcription: "today we'll learn rust"}
  ✗ bad match: {app_name: "Chrome", window_name: "YouTube", transcription: "discussing databases"}

focus on extracting:
- key activities (coding, watching, reading)
- specific applications (vscode, chrome, slack)
- content keywords (rust, meeting, video)
- contextual hints (time references, related activities)

output only valid json with the exact structure requested.
prioritize precision over recall - better to return no match than a wrong match.`;
    }, [appStats]);
    const loadSuggestionsIfNeeded = (0, react_1.useCallback)(() => {
        if (!hasLoadedSuggestions.current &&
            frames.length > 1000 &&
            !suggestions) {
            hasLoadedSuggestions.current = true;
            setIsLoadingSuggestions(true);
            const openai = new openai_1.default({
                apiKey: settings.aiProviderType === "screenpipe-cloud"
                    ? settings.user.token
                    : settings.openaiApiKey,
                baseURL: settings.aiUrl,
                dangerouslyAllowBrowser: true,
            });
            getCachedOrGenerateSuggestions(openai, settings.aiModel, getSystemPrompt(), appStats)
                .then(setSuggestions)
                .catch((error) => {
                console.warn("failed to load suggestions:", error);
                setSuggestions([
                    "last meeting in google meet",
                    "last time i was working on linkedin",
                    "last youtube video i watched",
                    "last time i was writing in notion",
                ]);
            })
                .finally(() => setIsLoadingSuggestions(false));
        }
    }, [frames.length, appStats, settings, suggestions]);
    // Only call when dialog opens
    const handleOpen = (0, react_1.useCallback)(() => {
        setOpen(true);
        loadSuggestionsIfNeeded();
    }, [loadSuggestionsIfNeeded]);
    const cancelSearch = (0, react_1.useCallback)(() => {
        if (abortController) {
            abortController.abort();
            setIsSearching(false);
            setSearchStatus("search cancelled");
        }
    }, [abortController]);
    const handleSearch = (query) => __awaiter(this, void 0, void 0, function* () {
        const controller = new AbortController();
        setAbortController(controller);
        setIsSearching(true);
        setSearchStatus("");
        const openai = new openai_1.default({
            apiKey: settings.aiProviderType === "screenpipe-cloud"
                ? settings.user.token
                : settings.openaiApiKey,
            baseURL: settings.aiUrl,
            dangerouslyAllowBrowser: true,
        });
        try {
            const systemPrompt = getSystemPrompt();
            const frameIndex = yield findRelevantFrame(query, frames, openai, settings.aiModel, (status) => setSearchStatus(status), systemPrompt, 0, undefined, controller.signal);
            if (frameIndex !== null) {
                onResultSelect(frameIndex);
                setOpen(false);
            }
            else {
                setSearchStatus("couldn't find that moment. try being more specific about the app or content you're looking for.");
            }
        }
        catch (error) {
            if (error.includes("AbortError")) {
                console.log("search aborted");
            }
            else {
                console.warn("search error:", error);
                setSearchStatus("search failed. please try again.");
            }
        }
        finally {
            setIsSearching(false);
            setAbortController(null);
        }
    });
    const regenerateSuggestions = (0, react_1.useCallback)(() => __awaiter(this, void 0, void 0, function* () {
        setIsLoadingSuggestions(true);
        const openai = new openai_1.default({
            apiKey: settings.aiProviderType === "screenpipe-cloud"
                ? settings.user.token
                : settings.openaiApiKey,
            baseURL: settings.aiUrl,
            dangerouslyAllowBrowser: true,
        });
        try {
            // Clear cache first
            localStorage.removeItem(CACHE_KEY);
            const newSuggestions = yield generateSuggestions(openai, settings.aiModel, getSystemPrompt(), appStats);
            setSuggestions(newSuggestions);
            // Update cache
            const cacheData = {
                suggestions: newSuggestions,
                timestamp: Date.now(),
                appsHash: generateAppsHash(appStats),
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        }
        catch (error) {
            console.warn("failed to regenerate suggestions:", error);
        }
        finally {
            setIsLoadingSuggestions(false);
        }
    }), [settings, appStats, getSystemPrompt]);
    return (<>
      <button_1.Button variant="ghost" size="icon" onClick={handleOpen} className="rounded-full">
        <lucide_react_1.Search className="h-4 w-4"/>
      </button_1.Button>

      <dialog_1.Dialog open={open} onOpenChange={(newOpen) => {
            if (!isSearching) {
                setOpen(newOpen);
            }
        }}>
        <dialog_1.DialogPortal>
          <dialog_1.DialogOverlay className="backdrop-blur-sm" style={{
            opacity: isSearching ? 0 : 0.8,
        }}/>
          <framer_motion_1.motion.div animate={{
            x: isSearching ? 200 : 0,
            transition: { duration: 0.3, ease: "easeInOut" },
        }}>
            <dialog_1.DialogContent className="sm:max-w-[500px]">
              <dialog_1.DialogTitle>Search your timeline</dialog_1.DialogTitle>
              <framer_motion_1.motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="p-6">
                <div className="relative">
                  <lucide_react_1.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                  <input_1.Input autoFocus placeholder="search in your timeline..." className="pl-9 h-12" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => {
            if (e.key === "Enter" && !isSearching) {
                handleSearch(searchQuery);
            }
        }} disabled={isSearching}/>
                  {isSearching && (<button_1.Button variant="ghost" size="icon" onClick={cancelSearch} className="absolute right-2 top-1/2 -translate-y-1/2">
                      <lucide_react_1.Square className="h-4 w-4"/>
                    </button_1.Button>)}
                </div>

                {searchStatus && (<framer_motion_1.motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2 text-sm">
                    {isSearching && (<lucide_react_1.Loader2 className="h-3 w-3 animate-spin text-primary"/>)}
                    <span className={isSearching ? "text-primary" : "text-muted-foreground"}>
                      {searchStatus}
                    </span>
                  </framer_motion_1.motion.div>)}

                <framer_motion_1.motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mt-4">
                  {suggestions && (<div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">
                        suggested searches
                      </p>
                      <button_1.Button variant="ghost" size="icon" onClick={regenerateSuggestions} disabled={isLoadingSuggestions} className="h-6 w-6">
                        <lucide_react_1.RefreshCw className="h-4 w-4"/>
                      </button_1.Button>
                    </div>)}
                  <div className="space-y-2">
                    {isLoadingSuggestions ? (
        // Skeleton loading state
        <>
                        {[1, 2, 3, 4, 5].map((i) => (<div key={i} className="h-10 bg-muted rounded-md animate-pulse"/>))}
                      </>) : suggestions ? (suggestions.map((suggestion, i) => (<framer_motion_1.motion.div key={suggestion} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                          <tooltip_1.TooltipProvider>
                            <tooltip_1.Tooltip>
                              <tooltip_1.TooltipTrigger asChild>
                                <button_1.Button variant="ghost" className="w-full justify-start text-left h-auto py-2 px-3 overflow-hidden" onClick={() => handleSearch(suggestion)} disabled={isSearching}>
                                  <div className="max-w-[400px] overflow-hidden text-ellipsis whitespace-nowrap">
                                    {suggestion}
                                  </div>
                                </button_1.Button>
                              </tooltip_1.TooltipTrigger>
                              <tooltip_1.TooltipContent side="top" align="start">
                                {suggestion}
                              </tooltip_1.TooltipContent>
                            </tooltip_1.Tooltip>
                          </tooltip_1.TooltipProvider>
                        </framer_motion_1.motion.div>))) : null}
                  </div>
                </framer_motion_1.motion.div>
              </framer_motion_1.motion.div>
            </dialog_1.DialogContent>
          </framer_motion_1.motion.div>
        </dialog_1.DialogPortal>
      </dialog_1.Dialog>
    </>);
}
