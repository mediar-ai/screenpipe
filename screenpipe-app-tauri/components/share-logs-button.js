"use strict";
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
exports.ShareLogsButton = void 0;
const button_1 = require("./ui/button");
const use_toast_1 = require("./ui/use-toast");
const lucide_react_1 = require("lucide-react");
const plugin_fs_1 = require("@tauri-apps/plugin-fs");
const core_1 = require("@tauri-apps/api/core");
const react_1 = require("react");
const use_copy_to_clipboard_1 = require("@/lib/hooks/use-copy-to-clipboard");
const use_settings_1 = require("@/lib/hooks/use-settings");
const app_1 = require("@tauri-apps/api/app");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const textarea_1 = require("./ui/textarea");
const tooltip_1 = require("./ui/tooltip");
const ShareLinkDisplay = ({ shareLink, onCopy, onClose, }) => {
    return (<div className="flex items-center gap-2 bg-secondary/30 px-3 py-2 rounded-lg border border-secondary animate-in fade-in slide-in-from-top-4">
      <div className="flex items-center gap-2 flex-1">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"/>
        <span className="text-sm font-mono">{shareLink}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button_1.Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-secondary/50 transition-colors" onClick={onCopy} title="Copy share link">
          <lucide_react_1.Copy className="h-3.5 w-3.5"/>
        </button_1.Button>
        <button_1.Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-secondary/50 transition-colors text-muted-foreground" onClick={onClose} title="Dismiss">
          <lucide_react_1.X className="h-3.5 w-3.5"/>
        </button_1.Button>
      </div>
    </div>);
};
const ShareLogsButton = ({ showShareLink = true, onComplete, }) => {
    const { toast } = (0, use_toast_1.useToast)();
    const { copyToClipboard } = (0, use_copy_to_clipboard_1.useCopyToClipboard)({ timeout: 3000 });
    const { settings } = (0, use_settings_1.useSettings)();
    const [isSending, setIsSending] = (0, react_1.useState)(false);
    const [shareLink, setShareLink] = (0, react_1.useState)("");
    const [machineId, setMachineId] = (0, react_1.useState)("");
    const [feedbackText, setFeedbackText] = (0, react_1.useState)("");
    const [isLoadingVideo, setIsLoadingVideo] = (0, react_1.useState)(false);
    const [screenshot, setScreenshot] = (0, react_1.useState)(null);
    const [mergedVideoPath, setMergedVideoPath] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const loadMachineId = () => __awaiter(void 0, void 0, void 0, function* () {
            let id = localStorage.getItem("machineId");
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem("machineId", id);
            }
            setMachineId(id);
        });
        loadMachineId();
    }, []);
    const getLogFiles = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const logFiles = yield (0, core_1.invoke)("get_log_files");
            return logFiles;
        }
        catch (error) {
            console.error("failed to get log files:", error);
            return [];
        }
    });
    const captureLastFiveMinutes = () => __awaiter(void 0, void 0, void 0, function* () {
        setIsLoadingVideo(true);
        try {
            // Fetch last video chunks
            const response = yield fetch("http://localhost:3030/raw_sql", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: `
            SELECT * FROM video_chunks 
            ORDER BY id DESC
            LIMIT 7
          `,
                }),
            });
            if (!response.ok)
                throw new Error("failed to fetch video chunks");
            const chunks = (yield response.json());
            // Merge frames
            const mergeResponse = yield fetch("http://localhost:3030/experimental/frames/merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    video_paths: chunks.map((c) => c.file_path),
                }),
            });
            if (!mergeResponse.ok)
                throw new Error("failed to merge video chunks");
            const { video_path } = yield mergeResponse.json();
            setMergedVideoPath(video_path);
        }
        catch (err) {
            console.error("failed to capture video:", err);
            toast({
                title: "video capture failed",
                description: "could not record last 5 minutes",
                variant: "destructive",
            });
        }
        finally {
            setIsLoadingVideo(false);
        }
    });
    const handleScreenshotUpload = (e) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const file = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0];
            if (!file)
                return;
            // Convert to data URL for preview
            const reader = new FileReader();
            reader.onload = (e) => {
                var _a;
                setScreenshot((_a = e.target) === null || _a === void 0 ? void 0 : _a.result);
            };
            reader.readAsDataURL(file);
        }
        catch (err) {
            console.error("Failed to select screenshot:", err);
        }
    });
    const sendLogs = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const logFiles = yield getLogFiles();
        if (!logFiles.length)
            return;
        setIsSending(true);
        try {
            const BASE_URL = 'https://screenpi.pe';
            const identifier = ((_a = settings.user) === null || _a === void 0 ? void 0 : _a.id) || machineId;
            const type = ((_b = settings.user) === null || _b === void 0 ? void 0 : _b.id) ? "user" : "machine";
            // Get all log contents
            const logContents = yield Promise.all(logFiles.map((file) => __awaiter(void 0, void 0, void 0, function* () {
                return ({
                    name: file.name,
                    content: yield (0, plugin_fs_1.readTextFile)(file.path),
                });
            })));
            const consoleLog = localStorage.getItem("console_logs") || "";
            const signedRes = yield fetch(`${BASE_URL}/api/logs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    identifier,
                    type,
                }),
            });
            const { data: { signedUrl, path, signedUrlScreenshot, signedUrlVideo, screenshotPath, videoPath, }, } = yield signedRes.json();
            const combinedLogs = logContents
                .map((log) => `\n=== ${log.name} ===\n${log.content}`)
                .join("\n\n") +
                "\n\n=== Browser Console Logs ===\n" +
                consoleLog;
            yield fetch(signedUrl, {
                method: "PUT",
                body: combinedLogs,
                headers: { "Content-Type": "text/plain" },
            });
            // Upload screenshot if exists
            if (screenshot && signedUrlScreenshot) {
                // Convert base64 to blob
                const response = yield fetch(screenshot);
                const blob = yield response.blob();
                // Upload directly using fetch
                yield fetch(signedUrlScreenshot, {
                    method: "PUT",
                    body: blob,
                    headers: { "Content-Type": blob.type },
                });
            }
            // Upload video if exists
            if (mergedVideoPath && signedUrlVideo) {
                console.log({
                    filePath: mergedVideoPath,
                    signedUrl: signedUrlVideo,
                });
                const videoUploaded = yield (0, core_1.invoke)("upload_file_to_s3", {
                    filePath: mergedVideoPath,
                    signedUrl: signedUrlVideo,
                });
                if (!videoUploaded)
                    throw new Error("Failed to upload video");
            }
            const os = (0, plugin_os_1.platform)();
            const os_version = (0, plugin_os_1.version)();
            const app_version = yield (0, app_1.getVersion)();
            const confirmRes = yield fetch(`${BASE_URL}/api/logs/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path,
                    identifier,
                    type,
                    os,
                    os_version,
                    app_version,
                    feedback_text: feedbackText,
                    screenshot_url: screenshotPath,
                    video_url: videoPath,
                }),
            });
            const { data: { id }, } = yield confirmRes.json();
            setShareLink(`${BASE_URL}/logs/${id}`);
        }
        catch (err) {
            console.error("log sharing failed:", err);
            toast({
                title: "sharing failed",
                description: String(err),
                variant: "destructive",
            });
        }
        finally {
            if (!showShareLink) {
                toast({
                    title: "feedback sent",
                    description: "thanks for your feedback!",
                });
            }
            if (onComplete)
                onComplete();
            setIsSending(false);
        }
    });
    return (<tooltip_1.TooltipProvider>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        {!shareLink ? (<>
            <textarea_1.Textarea placeholder="describe your feedback or issue..." value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} className="min-h-[120px] resize-none rounded-xl bg-secondary/5 placeholder:text-muted-foreground/50 focus:border-secondary/30 focus:ring-0 transition-colors"/>

            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer flex-none">
                <input type="file" accept="image/*" className="hidden" onChange={handleScreenshotUpload} disabled={!!screenshot}/>
                <button_1.Button variant={screenshot ? "secondary" : "outline"} size="sm" className={`gap-2 h-9 px-4 rounded-full transition-all ${screenshot
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                : ""}`} disabled={!!screenshot} asChild>
                  <span>
                    <lucide_react_1.Camera className="h-3.5 w-3.5"/>
                    <span>screenshot</span>
                  </span>
                </button_1.Button>
              </label>

              <tooltip_1.Tooltip delayDuration={200}>
                <tooltip_1.TooltipTrigger asChild>
                  <button_1.Button variant={mergedVideoPath ? "secondary" : "outline"} size="sm" onClick={captureLastFiveMinutes} className={`gap-2 h-9 px-4 rounded-full transition-all ${mergedVideoPath
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                : ""}`} disabled={isLoadingVideo}>
                    {isLoadingVideo ? (<lucide_react_1.Loader className="h-3.5 w-3.5 animate-spin"/>) : (<lucide_react_1.Video className="h-3.5 w-3.5"/>)}
                    <span>recording</span>
                    <span className="ml-1 text-xs text-muted-foreground/70">
                      5m
                    </span>
                  </button_1.Button>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent side="bottom" className="text-xs bg-secondary/80 backdrop-blur-sm border-secondary/30">
                  Attach last 5 minutes of screen recording
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </div>

            {screenshot && (<div className="relative w-48 aspect-video rounded-xl overflow-hidden bg-secondary/10 border border-secondary/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshot} alt="Screenshot preview" className="object-cover w-full h-full"/>
                <button_1.Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/80 hover:bg-background/95 backdrop-blur-sm" onClick={() => setScreenshot(null)}>
                  <lucide_react_1.X className="h-3.5 w-3.5"/>
                </button_1.Button>
              </div>)}

            <button_1.Button variant="default" size="sm" onClick={sendLogs} disabled={isSending || !feedbackText.trim()} className="gap-2 group relative h-10 px-5 rounded-full">
              {isSending ? (<>
                  <lucide_react_1.Loader className="h-3.5 w-3.5 animate-spin"/>
                  <span>sending feedback...</span>
                </>) : (<>
                  <lucide_react_1.Upload className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5"/>
                  <span>send feedback</span>
                </>)}
            </button_1.Button>
          </>) : (<>
            {showShareLink && (<ShareLinkDisplay shareLink={shareLink} onCopy={() => copyToClipboard(shareLink)} onClose={() => {
                    setShareLink("");
                    setFeedbackText("");
                    setScreenshot(null);
                    setMergedVideoPath(null);
                }}/>)}
          </>)}
      </div>
    </tooltip_1.TooltipProvider>);
};
exports.ShareLogsButton = ShareLogsButton;
