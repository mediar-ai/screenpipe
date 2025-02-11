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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineIconsSection = TimelineIconsSection;
const localforage_1 = __importDefault(require("localforage"));
const react_1 = __importStar(require("react"));
const utils_1 = require("@/lib/utils");
const framer_motion_1 = require("framer-motion");
const dialog_1 = require("@/components/ui/dialog");
const scroll_area_1 = require("@/components/ui/scroll-area");
const use_timeline_selection_1 = require("@/lib/hooks/use-timeline-selection");
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
// Add this near the top of the file, after imports
const GAP_THRESHOLD = 3 * 60 * 1000; // 5 minutes in milliseconds
function getAppIcon(appName, appPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = new URLSearchParams(Object.assign({ name: appName }, (appPath && { path: appPath })));
        try {
            const response = yield fetch(`http://localhost:11435/app-icon?${params}`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                },
            });
            if (!response.ok) {
                const error = yield response.text();
                throw new Error(`failed to get app icon: ${error}`);
            }
            return yield response.json();
        }
        catch (error) {
            console.error("error getting app icon:", error);
            return null;
        }
    });
}
function TimelineIconsSection({ blocks, timeRange, }) {
    const [iconCache, setIconCache] = (0, react_1.useState)({});
    const [selectedApp, setSelectedApp] = (0, react_1.useState)(null);
    const [iconInvocationCount, setIconInvocationCount] = (0, react_1.useState)({});
    const { setSelectionRange } = (0, use_timeline_selection_1.useTimelineSelection)();
    // Separate time range calculation
    //const timeRange = useMemo(() => {
    //	if (blocks.length === 0) return null;
    //	const startTime = new Date(blocks[blocks.length - 1].timestamp);
    //	const endTime = new Date(blocks[0].timestamp);
    //	return { start: startTime, end: endTime };
    //}, [blocks]);
    // Process blocks without icon dependency
    const { processedBlocks, processedAudioGroups } = (0, react_1.useMemo)(() => {
        if (!timeRange)
            return { processedBlocks: [], processedAudioGroups: [] };
        // Process audio groups first
        const audioGroups = blocks
            .flatMap((frame) => frame.devices.flatMap((device) => device.audio.map((audio) => ({
            deviceName: audio.device_name,
            isInput: audio.is_input,
            timestamp: new Date(frame.timestamp),
            duration: audio.duration_secs,
            percentThroughDay: ((new Date(frame.timestamp).getTime() -
                timeRange.start.getTime()) /
                (timeRange.end.getTime() - timeRange.start.getTime())) *
                100,
        }))))
            .filter((audio) => {
            const timestamp = audio.timestamp;
            return timestamp >= timeRange.start && timestamp <= timeRange.end;
        })
            .filter((audio, index, array) => {
            if (index === 0)
                return true;
            const prevAudio = array[index - 1];
            return (Math.abs(audio.percentThroughDay - prevAudio.percentThroughDay) > 0.25);
        });
        // Process app blocks (existing logic)
        const appGroups = {};
        blocks.forEach((frame) => {
            frame.devices.forEach((device) => {
                var _a;
                if (!((_a = device.metadata) === null || _a === void 0 ? void 0 : _a.app_name))
                    return;
                const timestamp = new Date(frame.timestamp);
                const appName = device.metadata.app_name;
                const windowTitle = device.metadata.window_name;
                if (timestamp < timeRange.start || timestamp > timeRange.end)
                    return;
                if (!appGroups[appName]) {
                    appGroups[appName] = [];
                }
                appGroups[appName].push({ timestamp, title: windowTitle });
            });
        });
        Object.entries(appGroups).forEach(([appName, timestamps]) => {
            timestamps.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            let currentBlockId = 0;
            let blockStart = timestamps[0];
            let lastTimestamp = timestamps[0];
            timestamps.forEach((entry, idx) => {
                if (entry.timestamp.getTime() - lastTimestamp.timestamp.getTime() >
                    GAP_THRESHOLD) {
                    currentBlockId++;
                    blockStart = entry;
                }
                entry.blockId = currentBlockId;
                lastTimestamp = entry;
            });
        });
        const b = [];
        Object.entries(appGroups).forEach(([appName, entries]) => {
            const blockIds = [...new Set(entries.map((e) => e.blockId))];
            blockIds.forEach((blockId) => {
                const blockEntries = entries.filter((e) => e.blockId === blockId);
                if (blockEntries.length === 0)
                    return;
                const blockStart = blockEntries[0].timestamp;
                const blockEnd = blockEntries[blockEntries.length - 1].timestamp;
                const blockMiddle = new Date(blockStart.getTime() +
                    (blockEnd.getTime() - blockStart.getTime()) / 2);
                const windowsInBlock = blockEntries
                    .filter((w) => w.title)
                    .map((w) => ({
                    title: w.title,
                    timestamp: w.timestamp,
                }))
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                b.push({
                    appName,
                    timestamp: blockMiddle,
                    percentThroughDay: ((blockMiddle.getTime() - timeRange.start.getTime()) /
                        (timeRange.end.getTime() - timeRange.start.getTime())) *
                        100,
                    windows: windowsInBlock,
                });
            });
        });
        return {
            processedBlocks: b
                .sort((a, b) => a.percentThroughDay - b.percentThroughDay)
                .filter((block, index, array) => {
                if (index === 0)
                    return true;
                const prevBlock = array[index - 1];
                return (Math.abs(block.percentThroughDay - prevBlock.percentThroughDay) >
                    0.25);
            }),
            processedAudioGroups: audioGroups,
        };
    }, [blocks, timeRange]); // Remove iconCache dependency
    // Add icons to blocks in a separate memo
    const blocksWithIcons = (0, react_1.useMemo)(() => {
        return processedBlocks.map((block) => (Object.assign(Object.assign({}, block), { iconSrc: iconCache[block.appName] })));
    }, [processedBlocks, iconCache]);
    const loadAppIcon = (0, react_1.useCallback)((appName, appPath) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (iconCache[appName])
                return;
            const cachedIcon = yield localforage_1.default.getItem(`icon-${appName}`);
            if (cachedIcon) {
                setIconCache((prev) => (Object.assign(Object.assign({}, prev), { [appName]: cachedIcon })));
                return;
            }
            if (iconInvocationCount[appName] >= 100)
                return;
            const icon = yield getAppIcon(appName, appPath);
            if (icon === null || icon === void 0 ? void 0 : icon.base64) {
                // Add null check for base64
                setIconCache((prev) => (Object.assign(Object.assign({}, prev), { [appName]: icon.base64 })));
                yield localforage_1.default.setItem(`icon-${appName}`, icon.base64);
                setIconInvocationCount((prev) => (Object.assign(Object.assign({}, prev), { [appName]: (prev[appName] || 0) + 1 })));
            }
        }
        catch (error) {
            console.error(`failed to load icon for ${appName}:`, error);
            // Fail silently - the UI will just not show an icon
        }
    }), [iconCache, iconInvocationCount]);
    (0, react_1.useEffect)(() => {
        const loadIcons = () => __awaiter(this, void 0, void 0, function* () {
            // Load icons for unique app names only
            processedBlocks.forEach((block) => {
                loadAppIcon(block.appName);
            });
        });
        loadIcons();
    }, [processedBlocks, loadAppIcon]);
    return (<>
      <div className="absolute -top-8 inset-x-0 h-8">
        {blocksWithIcons.map((block, i) => {
            const bgColor = (0, utils_1.stringToColor)(block.appName);
            return (<framer_motion_1.motion.div key={`${block.appName}-${i}`} className="absolute h-full pointer-events-auto cursor-pointer" style={{
                    left: `${block.percentThroughDay}%`,
                    transform: "translateX(-50%)",
                    zIndex: 50,
                }} onClick={() => setSelectedApp(block)} whileHover={{
                    scale: 1.5,
                    backgroundColor: "red",
                    y: -20,
                }} transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                }}>
              {block.iconSrc ? (<framer_motion_1.motion.div className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{
                        backgroundColor: `${bgColor}40`,
                        padding: "2px",
                    }}>
                  <img src={window.navigator.platform === "Linux"
                        ? `data:image/svg+xml;base64,${block.iconSrc}`
                        : `data:image/png;base64,${block.iconSrc}`} className="w-full h-full opacity-70" alt={block.appName} loading="lazy" decoding="async"/>
                </framer_motion_1.motion.div>) : (<framer_motion_1.motion.div className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: bgColor }}/>)}
            </framer_motion_1.motion.div>);
        })}

        {/* Add this new section for audio markers */}
        {processedAudioGroups.map((audio, i) => (<div key={`audio-${i}`} className="absolute h-full pointer-events-auto " style={{
                left: `${audio.percentThroughDay}%`,
                transform: "translateX(-50%)",
                zIndex: 40,
                top: "-16px", // Moved higher
            }}>
            <div className="w-4 h-4 flex items-center justify-center rounded-full bg-muted/50 backdrop-blur" style={{
                border: `1px solid ${audio.isInput ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.4)"}`,
            }}>
              <lucide_react_1.Volume2 className="w-2 h-2" style={{
                color: audio.isInput
                    ? "rgba(0, 0, 0, 0.7)"
                    : "rgba(0, 0, 0, 0.4)",
            }}/>
            </div>
          </div>))}
      </div>

      <dialog_1.Dialog open={selectedApp !== null} onOpenChange={() => setSelectedApp(null)}>
        <dialog_1.DialogContent className="max-w-md p-8">
          <dialog_1.DialogHeader>
            <dialog_1.DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(selectedApp === null || selectedApp === void 0 ? void 0 : selectedApp.iconSrc) && (<img src={window.navigator.platform === "Linux"
                ? `data:image/svg+xml;base64,${selectedApp.iconSrc}`
                : `data:image/png;base64,${selectedApp.iconSrc}`} className="w-6 h-6" alt={selectedApp.appName}/>)}
                <span>{selectedApp === null || selectedApp === void 0 ? void 0 : selectedApp.appName}</span>
              </div>
              <button_1.Button variant="outline" size="sm" className="gap-2" onClick={() => {
            if (!selectedApp)
                return;
            setSelectedApp(null);
            setSelectionRange({
                start: selectedApp.timestamp,
                end: new Date(selectedApp.timestamp.getTime() + 60000),
            });
        }}>
                <lucide_react_1.MessageSquarePlus className="h-4 w-4"/>
                <span className="text-xs">ask ai about this</span>
              </button_1.Button>
            </dialog_1.DialogTitle>
          </dialog_1.DialogHeader>

          <scroll_area_1.ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {selectedApp === null || selectedApp === void 0 ? void 0 : selectedApp.windows.map((window, i) => (<div key={i} className="p-2 rounded-lg bg-muted/50 text-sm">
                  <p className="font-medium">{window.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {window.timestamp.toLocaleTimeString()}
                  </p>
                </div>))}
            </div>
          </scroll_area_1.ScrollArea>
        </dialog_1.DialogContent>
      </dialog_1.Dialog>
    </>);
}
