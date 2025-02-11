"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const button_1 = require("@/components/ui/button");
const react_1 = __importStar(require("react"));
const date_time_picker_1 = require("./date-time-picker");
const use_toast_1 = require("@/lib/use-toast");
const lucide_react_1 = require("lucide-react");
const badge_1 = require("@/components/ui/badge");
const dialog_1 = require("@/components/ui/dialog");
const browser_1 = require("@screenpipe/browser");
const Pipe = () => {
    const { toast } = (0, use_toast_1.useToast)();
    const [startTime, setStartTime] = (0, react_1.useState)(new Date());
    const [endTime, setEndTime] = (0, react_1.useState)(new Date());
    const [mergedVideoPath, setMergedVideoPath] = (0, react_1.useState)("");
    const [mergedAudioPath, setMergedAudioPath] = (0, react_1.useState)("");
    const [videoBlobUrl, setVideoBlobUrl] = (0, react_1.useState)("");
    const [audioBlobUrl, setAudioBlobUrl] = (0, react_1.useState)("");
    const [isDialogOpen, setIsDialogOpen] = (0, react_1.useState)(false);
    const [isMerging, setIsMerging] = (0, react_1.useState)(false);
    const [activeContentType, setActiveContentType] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const createBlobUrl = (path, type) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log(`fetching blob url for path: ${path}`);
                const response = yield fetch(`/api/file?path=${encodeURIComponent(path)}`);
                console.log(`res status: ${response.status}`);
                if (!response.ok)
                    throw new Error(`failed to fetch: ${response.statusText}`);
                const blob = yield response.blob();
                const url = URL.createObjectURL(blob);
                if (type === "video") {
                    setVideoBlobUrl(url);
                    setAudioBlobUrl("");
                }
                else {
                    setAudioBlobUrl(url);
                    setVideoBlobUrl("");
                }
            }
            catch (error) {
                console.error("error creating blob URL:", error);
            }
        });
        if (mergedVideoPath) {
            createBlobUrl(mergedVideoPath, "video");
        }
        if (mergedAudioPath) {
            createBlobUrl(mergedAudioPath, "audio");
        }
        return () => {
            if (videoBlobUrl) {
                URL.revokeObjectURL(videoBlobUrl);
            }
            if (audioBlobUrl) {
                URL.revokeObjectURL(audioBlobUrl);
            }
        };
    }, [mergedVideoPath, mergedAudioPath]);
    (0, react_1.useEffect)(() => {
        if (videoBlobUrl || audioBlobUrl) {
            setIsDialogOpen(true);
        }
    }, [videoBlobUrl, audioBlobUrl]);
    const handleQuickTimeFilter = (minutes) => {
        const now = new Date();
        const newStartTime = new Date(now.getTime() - minutes * 60000);
        setStartTime(newStartTime);
        setEndTime(now);
    };
    const getMaxLimit = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const startTimeStr = startTime.toISOString();
            const endTimeStr = endTime.toISOString();
            const response = yield fetch(`http://localhost:3030/search?content_type=all&limit=30&offset=0&start_time=${startTimeStr}&end_time=${endTimeStr}&min_length=50&max_length=10000`);
            if (!response.ok) {
                throw new Error(`http error! status: ${response.status}`);
            }
            const data = yield response.json();
            return data.pagination.total;
        }
        catch (error) {
            toast({
                title: "error",
                variant: "destructive",
                description: `something went wrong: ${error.message}`,
                duration: 3000,
            });
            return;
        }
    });
    const fetchVideoContent = (startTime, endTime) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            browser_1.pipe.captureMainFeatureEvent("pipe-for-loom", {
                action: "fetch-video-content",
            });
            const limit = yield getMaxLimit();
            console.log("Limit:", limit);
            const response = yield fetch(`http://localhost:3030/search?q=&limit=${limit}&offset=0&content_type=ocr&start_time=${startTime}&end_time=${endTime}&min_length=50&max_length=200`);
            if (!response.ok) {
                throw new Error(`http error! status: ${response.status}`);
            }
            const data = yield response.json();
            const filePaths = data.data.map((item) => item.content.file_path);
            const uniqueFilePaths = [...new Set(filePaths)];
            return uniqueFilePaths;
        }
        catch (e) {
            toast({
                title: "error",
                variant: "destructive",
                description: `failed to get video: ${e.message}`,
                duration: 3000,
            });
            return;
        }
    });
    const fetchAudioContent = (startTime, endTime) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const limit = yield getMaxLimit();
            const response = yield fetch(`http://localhost:3030/search?q=&limit=${limit}&offset=0&content_type=audio&start_time=${startTime}&end_time=${endTime}&min_length=50&max_length=200`);
            if (!response.ok) {
                throw new Error(`http error! status: ${response.status}`);
            }
            const data = yield response.json();
            const filePaths = data.data.map((item) => item.content.file_path);
            const uniqueFilePaths = [...new Set(filePaths)];
            return uniqueFilePaths;
        }
        catch (e) {
            toast({
                title: "error",
                variant: "destructive",
                description: `failed to get video: ${e.message}`,
                duration: 3000,
            });
            return;
        }
    });
    const mergeContent = (contents, type) => __awaiter(void 0, void 0, void 0, function* () {
        const mergeContentPaths = [...new Set([...contents])];
        const mergePayload = {
            video_paths: mergeContentPaths,
        };
        try {
            const response = yield fetch(`http://localhost:3030/experimental/frames/merge`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(mergePayload),
            });
            if (!response.ok) {
                throw new Error(`http error! status: ${response.status}`);
            }
            const data = yield response.json();
            if (type === "video") {
                setMergedVideoPath(data.video_path);
                console.log("merged video path", mergedVideoPath);
            }
            else {
                setMergedAudioPath(data.video_path);
                console.log("merged audio path", mergedAudioPath);
            }
            console.log("data", data);
        }
        catch (error) {
            toast({
                title: "error",
                variant: "destructive",
                description: "ffmpge error, please report it on screenpipe's github!",
                duration: 3000,
            });
        }
    });
    const handleVideoMerging = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            setIsMerging(true);
            setActiveContentType("video");
            toast({
                title: "merging",
                description: "video merging in process...",
                duration: 3000,
            });
            const startTimeStr = startTime.toISOString();
            const endTimeStr = endTime.toISOString();
            const videoPaths = (yield fetchVideoContent(startTimeStr, endTimeStr));
            console.log("videoPaths", videoPaths);
            if (videoPaths.length < 2) {
                toast({
                    title: "insufficient content",
                    variant: "destructive",
                    description: "insufficient video contents in that time period, please try again later!",
                    duration: 3000,
                });
                setIsMerging(false);
                return;
            }
            yield mergeContent(videoPaths, "video");
        }
        catch (error) {
            console.error("error merging videos:", error);
            toast({
                title: "error",
                variant: "destructive",
                description: "error in video merging, please try again later!!",
                duration: 3000,
            });
            setIsMerging(false);
        }
    });
    const handleAudioMerging = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            setIsMerging(true);
            setActiveContentType("audio");
            toast({
                title: "merging",
                description: "audio merging in process...",
                duration: 3000,
            });
            const startTimeStr = startTime.toISOString();
            const endTimeStr = endTime.toISOString();
            const audioPaths = (yield fetchAudioContent(startTimeStr, endTimeStr));
            console.log("audioPaths", audioPaths);
            if (audioPaths.length < 2) {
                toast({
                    title: "insufficient content",
                    variant: "destructive",
                    description: "insufficient audio contents, please try again later",
                    duration: 3000,
                });
                setIsMerging(false);
                return;
            }
            yield mergeContent(audioPaths, "audio");
        }
        catch (error) {
            console.error("error merging audios:", error);
            toast({
                title: "error",
                variant: "destructive",
                description: "error in audio merging, please try again!",
                duration: 3000,
            });
            setIsMerging(false);
        }
    });
    return (<div className="w-full mt-4 flex flex-col justify-center items-center">
      <h1 className="font-medium text-xl">get loom of your spent time</h1>
      <div className="h-fit min-w-[550px] flex flex-row justify-between mt-10">
        <div>
          <h2 className="text-[15px]">start time:</h2>
          <date_time_picker_1.DateTimePicker date={startTime} setDate={setStartTime}/>
        </div>
        <div>
          <h2 className="text-[15px]">end time:</h2>
          <date_time_picker_1.DateTimePicker date={endTime} setDate={setEndTime}/>
        </div>
      </div>

      <div className="flex mt-8 space-x-2 justify-center">
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(30)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 30m
        </badge_1.Badge>
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(60)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 60m
        </badge_1.Badge>
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(12 * 60)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 12h
        </badge_1.Badge>
        <badge_1.Badge variant="outline" className="cursor-pointer hover:bg-secondary" onClick={() => handleQuickTimeFilter(24 * 60)}>
          <lucide_react_1.Clock className="mr-2 h-4 w-4"/>
          last 24h
        </badge_1.Badge>
      </div>

      <div className="flex mt-12 flex-row min-w-[550px] justify-between items-center">
        <button_1.Button className="!w-32 disabled:!cursor-not-allowed" variant={"default"} onClick={handleVideoMerging} disabled={isMerging}>
          get video loom
        </button_1.Button>
        <button_1.Button className="!w-32 disabled:!cursor-not-allowed" variant={"default"} onClick={handleAudioMerging} disabled={isMerging}>
          get audio loom
        </button_1.Button>
      </div>

      <dialog_1.Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
                setIsMerging(false);
            }
        }}>
        <dialog_1.DialogContent className="flex flex-col justify-center items-center max-w-[80rem] h-[650px] ">
          <dialog_1.DialogHeader className="flex flex-col justify-center items-center">
            <dialog_1.DialogTitle className="text-center text-2xl">
              loom for your spent time
            </dialog_1.DialogTitle>
          </dialog_1.DialogHeader>
          {activeContentType === "video" && videoBlobUrl && (<video controls className="w-[70%] rounded-md">
              <source src={videoBlobUrl} type="video/mp4"/>
              Your browser does not support the video tag.
            </video>)}
          {activeContentType === "audio" && audioBlobUrl && (<div className="bg-gray-100 p-4 rounded-md">
              <audio controls className="w-full">
                <source src={audioBlobUrl} type="video/mp4"/>
                Your browser does not support the audio element.
              </audio>
            </div>)}
        </dialog_1.DialogContent>
        <dialog_1.DialogFooter />
      </dialog_1.Dialog>
    </div>);
};
exports.default = Pipe;
