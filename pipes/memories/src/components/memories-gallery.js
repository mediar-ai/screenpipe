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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoriesGallery = MemoriesGallery;
const react_1 = require("react");
const framer_motion_1 = require("framer-motion");
const lucide_react_1 = require("lucide-react");
const date_fns_1 = require("date-fns");
const button_1 = require("@/components/ui/button");
const use_toast_1 = require("@/components/ui/use-toast");
const browser_1 = require("@screenpipe/browser");
const video_1 = require("@/components/video");
const skeleton_1 = require("@/components/ui/skeleton");
const openai_1 = require("openai");
const ai_1 = require("ai");
const use_settings_1 = require("@/lib/hooks/use-settings");
function MemoriesGallery() {
    const [memories, setMemories] = (0, react_1.useState)([]);
    const { toast } = (0, use_toast_1.useToast)();
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [loadingMore, setLoadingMore] = (0, react_1.useState)(false);
    const { settings } = (0, use_settings_1.useSettings)();
    const [videoDescriptions, setVideoDescriptions] = (0, react_1.useState)({});
    const abortControllerRef = (0, react_1.useRef)(null);
    const [collectiveDescription, setCollectiveDescription] = (0, react_1.useState)({ loading: false, content: "" });
    (0, react_1.useEffect)(() => {
        fetchMemories();
    }, []);
    const fetchMemories = (...args_1) => __awaiter(this, [...args_1], void 0, function* (append = false) {
        // if (isLoading || loadingMore) return;
        var _a, _b, _c;
        try {
            if (append) {
                setLoadingMore(true);
            }
            else {
                setIsLoading(true);
            }
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const targetCount = 6;
            const uniqueMemories = new Set(memories.map((m) => m.id));
            const newMemories = [];
            const MAX_ATTEMPTS = 12; // 2x the target count
            let totalAttempts = 0;
            for (let attempt = 0; attempt < targetCount * 2 &&
                newMemories.length < targetCount &&
                totalAttempts < MAX_ATTEMPTS; attempt++) {
                totalAttempts++;
                const randomTime = new Date(thirtyDaysAgo.getTime() +
                    Math.random() * (fiveMinutesAgo.getTime() - thirtyDaysAgo.getTime()));
                const response = yield browser_1.pipe.queryScreenpipe({
                    limit: 2,
                    contentType: "ocr",
                    //   includeFrames: true,
                    startTime: new Date(randomTime.getTime() - 1 * 60 * 60 * 1000).toISOString(),
                    endTime: new Date(randomTime.getTime() + 1 * 60 * 60 * 1000).toISOString(),
                });
                console.log(`attempt ${totalAttempts}: got ${((_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.length) || 0} results`);
                if (!((_b = response === null || response === void 0 ? void 0 : response.data) === null || _b === void 0 ? void 0 : _b.length)) {
                    continue;
                }
                if ((_c = response === null || response === void 0 ? void 0 : response.data) === null || _c === void 0 ? void 0 : _c.length) {
                    for (const item of response.data) {
                        // @ts-ignore
                        if (!uniqueMemories.has(item.content.frameId)) {
                            // @ts-ignore
                            uniqueMemories.add(item.content.frameId);
                            newMemories.push({
                                // @ts-ignore
                                id: item.content.frameId,
                                timestamp: item.content.timestamp,
                                preview_url: item.content.filePath,
                                duration: 0,
                                // @ts-ignore
                                app_name: item.content.appName || "",
                                // @ts-ignore
                                text: item.content.text,
                            });
                        }
                    }
                }
            }
            // If we didn't get enough memories, work with what we have
            if (newMemories.length === 0) {
                toast({
                    title: "note",
                    description: "no new memories found for this time period",
                });
            }
            setMemories((prev) => (append ? [...prev, ...newMemories] : newMemories));
            // Scroll to bottom if appending
            if (append) {
                setTimeout(() => {
                    window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: "smooth",
                    });
                }, 100);
            }
        }
        catch (err) {
            toast({
                variant: "destructive",
                title: "error",
                description: "failed to load memories",
            });
        }
        finally {
            setIsLoading(false);
            setLoadingMore(false);
        }
    });
    const generateVideoDescription = (memory) => __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        var _d, _e;
        if (videoDescriptions[memory.id])
            return;
        const openai = new openai_1.OpenAI({
            apiKey: settings.aiProviderType === "screenpipe-cloud"
                ? settings.user.token
                : settings.openaiApiKey,
            baseURL: settings.aiUrl,
            dangerouslyAllowBrowser: true,
        });
        setVideoDescriptions((prev) => (Object.assign(Object.assign({}, prev), { [memory.id]: {
                id: (0, ai_1.generateId)(),
                loading: true,
                content: "",
            } })));
        try {
            abortControllerRef.current = new AbortController();
            const stream = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages: [
                    {
                        role: "system",
                        content: "you are a helpful assistant that provides concise descriptions of OCR content from screen recordings. focus on key activities and content visible in the recording. you create short description of memories in less than 20 words.",
                    },
                    {
                        role: "user",
                        content: `describe this screen recording. app: ${memory.app_name}, text: ${memory.text}, duration: ${memory.duration}s`,
                    },
                ],
                stream: true,
            }, {
                signal: abortControllerRef.current.signal,
            });
            let fullResponse = "";
            try {
                for (var _f = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _f = true) {
                    _c = stream_1_1.value;
                    _f = false;
                    const chunk = _c;
                    const content = ((_e = (_d = chunk.choices[0]) === null || _d === void 0 ? void 0 : _d.delta) === null || _e === void 0 ? void 0 : _e.content) || "";
                    fullResponse += content;
                    setVideoDescriptions((prev) => (Object.assign(Object.assign({}, prev), { [memory.id]: Object.assign(Object.assign({}, prev[memory.id]), { content: fullResponse }) })));
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
        catch (err) {
            console.log("Failed to generate description:", err);
            // toast({
            //   variant: "destructive",
            //   title: "error",
            //   description: "failed to generate video description",
            // });
        }
        finally {
            setVideoDescriptions((prev) => (Object.assign(Object.assign({}, prev), { [memory.id]: Object.assign(Object.assign({}, prev[memory.id]), { loading: false }) })));
        }
    });
    const generateCollectiveDescription = () => __awaiter(this, void 0, void 0, function* () {
        var _a, e_2, _b, _c;
        var _d, _e;
        browser_1.pipe.captureMainFeatureEvent("memories", {
            action: "generate-summary",
        });
        if (memories.length === 0)
            return;
        setCollectiveDescription({ loading: true, content: "" });
        try {
            const openai = new openai_1.OpenAI({
                apiKey: settings.aiProviderType === "screenpipe-cloud"
                    ? settings.user.token
                    : settings.openaiApiKey,
                baseURL: settings.aiUrl,
                dangerouslyAllowBrowser: true,
            });
            const memoryTexts = memories
                .map((m) => `[${(0, date_fns_1.format)(new Date(m.timestamp), "PPp")} - ${m.app_name}]: ${m.text}`)
                .join("\n");
            const stream = yield openai.chat.completions.create({
                model: settings.aiModel,
                messages: [
                    {
                        role: "system",
                        content: "you are a helpful assistant that provides concise summaries of daily activities from screen recordings. create a brief narrative of what the person was doing across these memories in 2-3 sentences max. its a bunch of OCR'd screens, make something value packed and interesting.",
                    },
                    {
                        role: "user",
                        content: `summarize these screen recording contents:\n${memoryTexts}`,
                    },
                ],
                stream: true,
            });
            let fullResponse = "";
            try {
                for (var _f = true, stream_2 = __asyncValues(stream), stream_2_1; stream_2_1 = yield stream_2.next(), _a = stream_2_1.done, !_a; _f = true) {
                    _c = stream_2_1.value;
                    _f = false;
                    const chunk = _c;
                    const content = ((_e = (_d = chunk.choices[0]) === null || _d === void 0 ? void 0 : _d.delta) === null || _e === void 0 ? void 0 : _e.content) || "";
                    fullResponse += content;
                    setCollectiveDescription((prev) => (Object.assign(Object.assign({}, prev), { content: fullResponse })));
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_f && !_a && (_b = stream_2.return)) yield _b.call(stream_2);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
        catch (err) {
            console.log("failed to generate collective description:", err);
            toast({
                variant: "destructive",
                title: "error",
                description: "failed to generate collective description",
            });
        }
        finally {
            setCollectiveDescription((prev) => (Object.assign(Object.assign({}, prev), { loading: false })));
        }
    });
    return (<div className="w-full max-w-7xl mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
        {isLoading
            ? // Initial loading skeletons
                [...Array(6)].map((_, i) => (<div key={`initial-skeleton-${i}`} className="rounded-lg overflow-hidden bg-background border">
                <skeleton_1.Skeleton className="aspect-video w-full"/>
                <div className="p-3 space-y-1">
                  <skeleton_1.Skeleton className="h-4 w-3/4"/>
                  <skeleton_1.Skeleton className="h-3 w-1/2"/>
                  <skeleton_1.Skeleton className="h-3 w-1/4"/>
                </div>
              </div>))
            : // Existing memories rendering
                memories.map((memory) => (<framer_motion_1.motion.div key={memory.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg overflow-hidden bg-background border flex flex-col">
                <video_1.VideoComponent filePath={memory.preview_url} className="w-full h-full" onLoadStart={() => generateVideoDescription(memory)}/>
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-center">
                    <lucide_react_1.Calendar className="h-3 w-3 mr-1"/>
                    {(0, date_fns_1.format)(new Date(memory.timestamp), "PPp")}
                  </div>
                  {videoDescriptions[memory.id] && (<framer_motion_1.motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted-foreground mt-2">
                      {videoDescriptions[memory.id].loading ? (<div className="flex items-center justify-center">
                          <lucide_react_1.Loader2 className="h-3 w-3 animate-spin mr-2"/>
                          generating description...
                        </div>) : (videoDescriptions[memory.id].content)}
                    </framer_motion_1.motion.div>)}
                </div>
              </framer_motion_1.motion.div>))}

        {/* Loading skeletons for load more */}
        {loadingMore && (<>
            {[...Array(6)].map((_, i) => (<div key={`skeleton-${i}`} className="rounded-lg overflow-hidden bg-background border">
                <skeleton_1.Skeleton className="aspect-video w-full"/>
                <div className="p-3 space-y-1">
                  <skeleton_1.Skeleton className="h-4 w-3/4"/>
                  <skeleton_1.Skeleton className="h-3 w-1/2"/>
                  <skeleton_1.Skeleton className="h-3 w-1/4"/>
                </div>
              </div>))}
          </>)}
      </div>

      <div className="mt-8 space-y-4">
        <button_1.Button className="mx-auto block" onClick={generateCollectiveDescription} disabled={isLoading || loadingMore || collectiveDescription.loading}>
          {collectiveDescription.loading ? (<div className="flex items-center">
              <lucide_react_1.Loader2 className="h-4 w-4 animate-spin mr-2"/>
              generating summary...
            </div>) : ("generate summary of visible memories")}
        </button_1.Button>

        {collectiveDescription.content && (<framer_motion_1.motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-muted-foreground text-center max-w-2xl mx-auto p-4 rounded-lg border bg-background">
            {collectiveDescription.content}
          </framer_motion_1.motion.div>)}
      </div>

      <button_1.Button variant="outline" className="mt-8 mx-auto block" onClick={() => fetchMemories(true)} disabled={isLoading || loadingMore}>
        {loadingMore ? "loading..." : "load more memories"}
      </button_1.Button>
    </div>);
}
