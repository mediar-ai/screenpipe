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
exports.VideoComponent = void 0;
const react_1 = require("react");
const video_actions_1 = require("@/lib/actions/video-actions");
const utils_1 = require("@/lib/utils");
exports.VideoComponent = (0, react_1.memo)(function VideoComponent({ filePath, customDescription, className, startTime, endTime, }) {
    const [mediaSrc, setMediaSrc] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [isAudio, setIsAudio] = (0, react_1.useState)(false);
    const sanitizeFilePath = (0, react_1.useCallback)((path) => {
        const isWindows = navigator.userAgent.includes("Windows");
        if (isWindows) {
            return path; // no sanitization on windows
        }
        return path
            .replace(/^["']|["']$/g, "")
            .trim()
            .replace(/\//g, "/");
    }, []);
    const renderFileLink = () => (<div className="mt-2 text-center text-xs text-gray-500 truncate px-2" title={filePath}>
      {customDescription || filePath}
    </div>);
    const validateMedia = (path) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(`http://localhost:3030/experimental/validate/media?file_path=${encodeURIComponent(path)}`);
            const result = yield response.json();
            return result.status;
        }
        catch (error) {
            console.error("Failed to validate media:", error);
            return "Failed to validate media";
        }
    });
    (0, react_1.useEffect)(() => {
        function loadMedia() {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const sanitizedPath = sanitizeFilePath(filePath);
                    console.log("Sanitized path:", sanitizedPath);
                    if (!sanitizedPath) {
                        throw new Error("Invalid file path");
                    }
                    const validationStatus = yield validateMedia(sanitizedPath);
                    console.log("Media file:", validationStatus);
                    if (validationStatus === "valid media file") {
                        setIsAudio(sanitizedPath.toLowerCase().includes("input") ||
                            sanitizedPath.toLowerCase().includes("output"));
                        const { data, mimeType } = yield (0, video_actions_1.getMediaFile)(sanitizedPath);
                        const binaryData = atob(data);
                        const bytes = new Uint8Array(binaryData.length);
                        for (let i = 0; i < binaryData.length; i++) {
                            bytes[i] = binaryData.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: mimeType });
                        setMediaSrc(URL.createObjectURL(blob));
                    }
                    else if (validationStatus.startsWith("media file does not exist")) {
                        throw new Error(`${isAudio ? "audio" : "video"} file not exists, it might get deleted`);
                    }
                    else if (validationStatus.startsWith("invalid media file")) {
                        throw new Error(`the ${isAudio ? "audio" : "video"} file is not written completely, please try again later`);
                    }
                    else {
                        throw new Error("unknown media validation status");
                    }
                }
                catch (error) {
                    console.warn("Failed to load media:", error);
                    setError(`Failed to load media: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
            });
        }
        loadMedia();
        return () => {
            if (mediaSrc)
                URL.revokeObjectURL(mediaSrc);
        };
    }, [filePath, sanitizeFilePath]);
    if (error) {
        return (<div className="w-full p-4 bg-red-100 border border-red-300 rounded-md">
        <p className="text-red-700">{error}</p>
        {renderFileLink()}
      </div>);
    }
    if (!mediaSrc) {
        return (<div className={(0, utils_1.cn)("w-full h-48 bg-gray-200 animate-pulse rounded-md flex items-center justify-center", className)}>
        <span className="text-gray-500">Loading media...</span>
      </div>);
    }
    return (<div className={(0, utils_1.cn)("w-full max-w-2xl text-center", className)}>
      {isAudio ? (<AudioPlayer startTime={startTime} endTime={endTime} mediaSrc={mediaSrc}/>) : (<video controls className="w-full rounded-md">
          <source src={mediaSrc} type='video/mp4; codecs="hvc1"'/>
          <source src={mediaSrc} type='video/mp4; codecs="hvec"'/>
          <source src={mediaSrc} type="video/mp4"/>
          Your browser does not support the video tag.
        </video>)}
      {renderFileLink()}
    </div>);
});
const AudioPlayer = (0, react_1.memo)(function AudioPlayer({ startTime, endTime, mediaSrc, }) {
    const [duration, setDuration] = (0, react_1.useState)(0);
    const [currentTime, setCurrentTime] = (0, react_1.useState)(0);
    const [isPlaying, setIsPlaying] = (0, react_1.useState)(false);
    const audioRef = (0, react_1.useRef)(null);
    const audioElement = (0, react_1.useMemo)(() => (<audio ref={audioRef} className="w-full" preload="auto" onLoadedMetadata={(e) => {
            const audio = e.target;
            setDuration(audio.duration);
            if (startTime !== undefined) {
                audio.currentTime = startTime;
            }
        }} onTimeUpdate={(e) => {
            const audio = e.target;
            if (Math.abs(audio.currentTime - currentTime) > 0.1) {
                setCurrentTime(audio.currentTime);
            }
        }} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}>
        <source src={mediaSrc} type="audio/mpeg"/>
        Your browser does not support the audio element.
      </audio>), [mediaSrc, startTime, currentTime]);
    const togglePlay = () => __awaiter(this, void 0, void 0, function* () {
        if (!audioRef.current)
            return;
        try {
            if (isPlaying) {
                audioRef.current.pause();
            }
            else {
                yield audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
        catch (error) {
            console.error("Playback failed:", error);
            setIsPlaying(false);
        }
    });
    const handleTimeChange = (e) => __awaiter(this, void 0, void 0, function* () {
        if (!audioRef.current)
            return;
        const time = parseFloat(e.target.value);
        const wasPlaying = isPlaying;
        if (wasPlaying) {
            audioRef.current.pause();
        }
        // Set the time directly on the audio element first
        audioRef.current.currentTime = time;
        // Then update the state
        setCurrentTime(time);
        if (wasPlaying) {
            try {
                yield audioRef.current.play();
            }
            catch (error) {
                console.error("Playback failed:", error);
                setIsPlaying(false);
            }
        }
    });
    return (<div className="bg-gray-100 px-4 py-6 rounded-md">
      <div className="relative">
        {startTime !== null && (<div className="absolute top-[-8px] h-6 w-0.5 bg-black z-10" style={{
                left: `calc(88px + ${(startTime || 0) / duration} * calc(100% - 176px))`,
            }}>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs">
              Start
            </div>
          </div>)}
        {endTime !== null && (<div className="absolute top-[-8px] h-6 w-0.5 bg-black z-10" style={{
                left: `calc(88px + ${(endTime || 0) / duration} * calc(100% - 176px))`,
            }}>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xs">
              End
            </div>
          </div>)}
        <button onClick={togglePlay} className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-black hover:bg-gray-800 text-white rounded-full">
          {isPlaying ? (<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>) : (<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>)}
        </button>
        <div className="mx-[88px] relative">
          <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
            <div className="h-full bg-black" style={{
            width: `${(currentTime / duration) * 100}%`,
        }}/>
          </div>
          <div className="absolute top-1/2 -translate-x-1/3 -translate-y-1/2 w-2 h-2 bg-black rounded-full cursor-pointer hover:bg-gray-800 hover:h-4 hover:w-4" style={{
            left: `${(currentTime / duration) * 100}%`,
        }}/>
          <input type="range" min={0} max={duration} value={currentTime} onChange={handleTimeChange} className="absolute inset-0 w-full opacity-0 cursor-pointer" step="any"/>
        </div>
        {audioElement}
      </div>
    </div>);
});
