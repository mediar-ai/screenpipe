"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioTranscript = AudioTranscript;
const react_1 = require("react");
const button_1 = require("@/components/ui/button");
const card_1 = require("@/components/ui/card");
const lucide_react_1 = require("lucide-react");
const video_1 = require("@/components/video");
function formatDurationHuman(durationInSeconds) {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = Math.floor(durationInSeconds % 60);
    const parts = [];
    if (hours > 0)
        parts.push(`${hours}h`);
    if (minutes > 0)
        parts.push(`${minutes}m`);
    if (seconds > 0)
        parts.push(`${seconds}s`);
    return parts.join(" ");
}
function calculateTimeRange(startTime, durationInSeconds) {
    const endTime = new Date(startTime.getTime() + durationInSeconds * 1000);
    return {
        start: startTime,
        end: endTime,
    };
}
function formatTimeRange(range) {
    const formatOptions = {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        // fractionalSecondDigits: 3,
    };
    return `${range.start.toLocaleTimeString([], formatOptions)} - ${range.end.toLocaleTimeString([], formatOptions)}`;
}
function AudioTranscript({ frames, currentIndex, groupingWindowMs = 30000, onClose, }) {
    const [playing, setPlaying] = (0, react_1.useState)(null);
    const [position, setPosition] = (0, react_1.useState)(() => ({
        x: window.innerWidth - 320,
        y: 100,
    }));
    const [isDragging, setIsDragging] = (0, react_1.useState)(false);
    const [dragOffset, setDragOffset] = (0, react_1.useState)({ x: 0, y: 0 });
    const [windowSize, setWindowSize] = (0, react_1.useState)({ width: 300, height: 500 });
    const resizerRef = (0, react_1.useRef)(null);
    const panelRef = (0, react_1.useRef)(null);
    // 2. Memoize the audio grouping logic
    const audioGroups = (0, react_1.useMemo)(() => {
        if (!frames.length)
            return [];
        const currentFrame = frames[currentIndex];
        const currentTime = new Date(currentFrame === null || currentFrame === void 0 ? void 0 : currentFrame.timestamp);
        const windowStart = new Date(currentTime.getTime() - groupingWindowMs);
        const windowEnd = new Date(currentTime.getTime() + groupingWindowMs);
        // Get frames within our time window
        const nearbyFrames = frames.filter((frame) => {
            const frameTime = new Date(frame.timestamp);
            return frameTime >= windowStart && frameTime <= windowEnd;
        });
        // Check if any nearby frames have audio
        const hasNearbyAudio = nearbyFrames.some((frame) => frame.devices.some((device) => device.audio.length > 0));
        // Group audio by device
        const groups = new Map();
        nearbyFrames.forEach((frame) => {
            frame.devices.forEach((device) => {
                device.audio.forEach((audio) => {
                    const key = `${audio.device_name}-${audio.is_input}`;
                    if (!groups.has(key)) {
                        groups.set(key, {
                            deviceName: audio.device_name,
                            isInput: audio.is_input,
                            audioItems: [],
                            startTime: new Date(frame.timestamp),
                            endTime: new Date(frame.timestamp),
                        });
                    }
                    const group = groups.get(key);
                    group.audioItems.push(audio);
                    // Update time range
                    const frameTime = new Date(frame.timestamp);
                    if (frameTime < group.startTime)
                        group.startTime = frameTime;
                    if (frameTime > group.endTime)
                        group.endTime = frameTime;
                });
            });
        });
        return Array.from(groups.values());
    }, [frames, currentIndex, groupingWindowMs]);
    // 3. Memoize visibility based on audio groups
    const isVisible = (0, react_1.useMemo)(() => {
        return audioGroups.length > 0;
    }, [audioGroups]);
    // 4. Memoize handlers
    const handlePanelMouseMove = (0, react_1.useCallback)((e) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y,
            });
        }
    }, [isDragging, dragOffset]);
    const handlePlay = (0, react_1.useCallback)((audioPath) => {
        setPlaying((current) => (current === audioPath ? null : audioPath));
    }, []);
    const handlePanelMouseDown = (e) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    };
    const handlePanelMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
        }
    };
    const handleResizeMouseDown = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = windowSize.width;
        const startHeight = windowSize.height;
        const handleMouseMove = (moveEvent) => {
            const newWidth = Math.max(200, startWidth + moveEvent.clientX - startX);
            const newHeight = Math.max(200, startHeight + moveEvent.clientY - startY);
            setWindowSize({ width: newWidth, height: newHeight });
        };
        const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };
    const handleClose = (e) => {
        e.stopPropagation();
        onClose === null || onClose === void 0 ? void 0 : onClose();
    };
    return isVisible ? (<div ref={panelRef} style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: windowSize.width,
            height: windowSize.height,
            cursor: isDragging ? "grabbing" : "default",
        }} className="audio-transcript-panel bg-background/80 backdrop-blur border border-muted-foreground rounded-lg shadow-lg z-[100] overflow-hidden">
			<div className="select-none cursor-grab active:cursor-grabbing p-2 border-b border-muted-foreground" onMouseDown={handlePanelMouseDown} onMouseMove={handlePanelMouseMove} onMouseUp={handlePanelMouseUp} onMouseLeave={handlePanelMouseUp}>
				<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
					<div className="flex items-center gap-2">
						<lucide_react_1.GripHorizontal className="w-4 h-4"/>
						<span>audio transcripts</span>
					</div>
					<button_1.Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleClose}>
						<lucide_react_1.X className="h-3 w-3"/>
					</button_1.Button>
				</div>
			</div>

			<div className="space-y-2 p-2 overflow-y-auto" style={{
            height: "calc(100% - 37px)",
            overscrollBehavior: "contain", // Prevent scroll chaining
            WebkitOverflowScrolling: "touch", // Smooth scrolling on iOS
        }}>
				{audioGroups.map((group, groupIndex) => (<card_1.Card key={groupIndex} className="p-4 bg-background/80 backdrop-blur">
						<div className="text-xs text-muted-foreground mb-2">
							{group.deviceName} ({group.isInput ? "input" : "output"})
							<div className="text-[10px]">
								{formatTimeRange(calculateTimeRange(group.startTime, group.audioItems.reduce((value, item) => value + item.duration_secs, 0)))}
							</div>
						</div>

						{group.audioItems.map((audio, index) => (<div key={index} className="space-y-2 mb-2 last:mb-0">
								<div className="flex items-center gap-2">
									<button_1.Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handlePlay(audio.audio_file_path)}>
										{playing === audio.audio_file_path ? (<lucide_react_1.Pause className="h-3 w-3"/>) : (<lucide_react_1.Play className="h-3 w-3"/>)}
									</button_1.Button>
									<div className="flex items-center gap-1 text-xs">
										<lucide_react_1.Volume2 className="h-3 w-3"/>
										<span>
											{formatDurationHuman(Math.round(audio.duration_secs))}
										</span>
									</div>
								</div>

								{audio.transcription && (<div className="text-xs pl-8 text-muted-foreground">
										{audio.transcription}
									</div>)}

								{playing === audio.audio_file_path && (<div className="pl-8">
										<video_1.VideoComponent filePath={audio.audio_file_path}/>
									</div>)}
							</div>))}
					</card_1.Card>))}
			</div>

			<div ref={resizerRef} onMouseDown={handleResizeMouseDown} className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize bg-transparent" style={{
            borderTopLeftRadius: "4px",
            borderBottomRightRadius: "4px",
            cursor: "se-resize",
        }}/>
		</div>) : null;
}
