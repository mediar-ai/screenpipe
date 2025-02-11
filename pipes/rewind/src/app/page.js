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
exports.default = Timeline;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const audio_transcript_1 = require("@/components/timeline/audio-transcript");
const ai_panel_1 = require("@/components/timeline/ai-panel");
const use_timeline_selection_1 = require("@/lib/hooks/use-timeline-selection");
const lodash_1 = require("lodash");
const agents_1 = require("@/components/timeline/agents");
const timeline_controls_1 = require("@/components/timeline/timeline-controls");
const date_fns_1 = require("date-fns");
const get_start_date_1 = require("@/lib/actions/get-start-date");
const use_timeline_data_1 = require("@/lib/hooks/use-timeline-data");
const use_current_frame_1 = require("@/lib/hooks/use-current-frame");
const timeline_1 = require("@/components/timeline/timeline");
const use_timeline_store_1 = require("@/lib/hooks/use-timeline-store");
const has_frames_date_1 = require("@/lib/actions/has-frames-date");
// Add this easing function at the top level
const easeOutCubic = (x) => {
    return 1 - Math.pow(1 - x, 3);
};
function Timeline() {
    const [currentIndex, setCurrentIndex] = (0, react_1.useState)(0);
    const [isAiPanelExpanded, setIsAiPanelExpanded] = (0, react_1.useState)(false);
    const containerRef = (0, react_1.useRef)(null);
    const [aiPanelPosition, setAiPanelPosition] = (0, react_1.useState)({ x: 0, y: 0 });
    // const [searchResults, setSearchResults] = useState<number[]>([]);
    const [startAndEndDates, setStartAndEndDates] = (0, react_1.useState)({
        start: new Date(new Date().setHours(0, 0, 0, 0)),
        end: new Date(),
    });
    const { currentFrame, setCurrentFrame } = (0, use_current_frame_1.useCurrentFrame)((index) => {
        setCurrentIndex(index);
    });
    const { currentDate, setCurrentDate, fetchTimeRange, hasDateBeenFetched } = (0, use_timeline_store_1.useTimelineStore)();
    const { frames, isLoading, error, message, fetchNextDayData } = (0, use_timeline_data_1.useTimelineData)(currentDate, (frame) => {
        setCurrentFrame(frame);
    });
    (0, react_1.useEffect)(() => {
        const getStartDateAndSet = () => __awaiter(this, void 0, void 0, function* () {
            const data = yield (0, get_start_date_1.getStartDate)();
            if (!("error" in data)) {
                setStartAndEndDates((prev) => (Object.assign(Object.assign({}, prev), { start: data })));
            }
        });
        getStartDateAndSet();
    }, []);
    (0, react_1.useEffect)(() => {
        setAiPanelPosition({
            x: window.innerWidth - 400,
            y: window.innerHeight / 4,
        });
    }, []);
    (0, react_1.useEffect)(() => {
        const startTime = new Date(currentDate);
        startTime.setHours(0, 0, 0, 0);
        const endTime = new Date(currentDate);
        if (endTime.getDate() === new Date().getDate()) {
            endTime.setMinutes(endTime.getMinutes() - 5);
        }
        else {
            endTime.setHours(23, 59, 59, 999);
        }
        fetchTimeRange(startTime, endTime);
    }, [currentDate]);
    (0, react_1.useEffect)(() => {
        if (currentFrame) {
            const frameDate = new Date(currentFrame.timestamp);
            if (!(0, date_fns_1.isSameDay)(frameDate, currentDate)) {
                setCurrentDate(frameDate);
            }
        }
    }, [currentFrame, currentDate]);
    const handleScroll = (0, react_1.useMemo)(() => (0, lodash_1.throttle)((e) => {
        var _a, _b, _c;
        // Move these checks outside the throttle to improve performance
        const isWithinAiPanel = e.target instanceof Node &&
            ((_a = document.querySelector(".ai-panel")) === null || _a === void 0 ? void 0 : _a.contains(e.target));
        const isWithinAudioPanel = e.target instanceof Node &&
            ((_b = document
                .querySelector(".audio-transcript-panel")) === null || _b === void 0 ? void 0 : _b.contains(e.target));
        const isWithinTimelineDialog = e.target instanceof Node &&
            ((_c = document.querySelector('[role="dialog"]')) === null || _c === void 0 ? void 0 : _c.contains(e.target));
        if (isWithinAiPanel || isWithinAudioPanel || isWithinTimelineDialog) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        // Calculate scroll intensity based on absolute delta
        const scrollIntensity = Math.abs(e.deltaY);
        const direction = -Math.sign(e.deltaY);
        // Change this if you want limit the index change
        const limitIndexChange = 15;
        // Adjust index change based on scroll intensity
        const indexChange = direction *
            Math.min(limitIndexChange, Math.ceil(Math.pow(scrollIntensity / 50, 1.5)));
        requestAnimationFrame(() => {
            setCurrentIndex((prevIndex) => {
                const newIndex = Math.min(Math.max(0, Math.floor(prevIndex + indexChange)), frames.length - 1);
                if (newIndex !== prevIndex && frames[newIndex]) {
                    setCurrentFrame(frames[newIndex]);
                }
                return newIndex;
            });
        });
    }, 16, { leading: true, trailing: false }), [frames]);
    (0, react_1.useEffect)(() => {
        const preventScroll = (e) => {
            var _a, _b, _c;
            const isWithinAiPanel = (_a = document
                .querySelector(".ai-panel")) === null || _a === void 0 ? void 0 : _a.contains(e.target);
            const isWithinAudioPanel = (_b = document
                .querySelector(".audio-transcript-panel")) === null || _b === void 0 ? void 0 : _b.contains(e.target);
            const isWithinTimelineDialog = (_c = document
                .querySelector('[role="dialog"]')) === null || _c === void 0 ? void 0 : _c.contains(e.target);
            if (!isWithinAiPanel && !isWithinAudioPanel && !isWithinTimelineDialog) {
                e.preventDefault();
            }
        };
        document.addEventListener("wheel", preventScroll, { passive: false });
        return () => document.removeEventListener("wheel", preventScroll);
    }, []);
    const handleRefresh = () => {
        window.location.reload();
    };
    (0, react_1.useEffect)(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener("wheel", handleScroll, { passive: false });
        }
        return () => {
            if (container) {
                container.removeEventListener("wheel", handleScroll);
            }
        };
    }, [handleScroll]);
    const jumpToTime = (targetDate) => {
        // Find the closest frame to the target date
        if (frames.length === 0)
            return;
        const targetTime = targetDate.getTime();
        let closestIndex = 0;
        let closestDiff = Infinity;
        frames.forEach((frame, index) => {
            const frameTime = new Date(frame.timestamp).getTime();
            const diff = Math.abs(frameTime - targetTime);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIndex = index;
            }
        });
        // Update cursor position
        setCurrentIndex(closestIndex);
        if (frames[closestIndex]) {
            setCurrentFrame(frames[closestIndex]);
            //	setCurrentDate(new Date(frames[closestIndex].timestamp));
        }
    };
    const handleDateChange = (newDate) => __awaiter(this, void 0, void 0, function* () {
        const checkFramesForDate = yield (0, has_frames_date_1.hasFramesForDate)(newDate);
        if (!checkFramesForDate) {
            let subDate;
            if ((0, date_fns_1.isAfter)(currentDate, newDate)) {
                subDate = (0, date_fns_1.subDays)(newDate, 1);
            }
            else {
                subDate = (0, date_fns_1.addDays)(newDate, 1);
            }
            return yield handleDateChange(subDate);
        }
        if (!hasDateBeenFetched(newDate)) {
            setCurrentFrame(null);
            const frameTimeStamp = new Date(newDate);
            if (frameTimeStamp.getDate() === new Date(currentDate).getDate()) {
                return;
            }
            if ((0, date_fns_1.isAfter)(startAndEndDates.start.getDate(), newDate.getDate())) {
                return;
            }
            setCurrentDate(newDate);
        }
        else {
            jumpToTime(newDate);
        }
    });
    const handleJumpToday = () => {
        window.location.reload();
    };
    const animateToIndex = (targetIndex, duration = 1000) => {
        const startIndex = currentIndex;
        const startTime = performance.now();
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Apply easing
            const easedProgress = easeOutCubic(progress);
            // Calculate the current position
            const newIndex = Math.round(startIndex + (targetIndex - startIndex) * easedProgress);
            // Update the frame
            setCurrentIndex(newIndex);
            if (frames[newIndex]) {
                setCurrentFrame(frames[newIndex]);
            }
            // Continue animation if not complete
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    };
    return (<use_timeline_selection_1.TimelineProvider>
			<div ref={containerRef} className="inset-0 flex flex-col bg-background text-foreground relative" style={{
            height: "100vh",
            overscrollBehavior: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
        }}>
				<div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
					<div className="flex items-center gap-4">
						<timeline_controls_1.TimelineControls currentDate={currentDate} startAndEndDates={startAndEndDates} onDateChange={handleDateChange} onJumpToday={handleJumpToday} className="shadow-lg"/>
						{/* <TimelineSearch2
frames={frames}
onResultSelect={animateToIndex}
onSearchResults={setSearchResults}
/> */}
					</div>
				</div>

				<div className="flex-1 relative min-h-0">
					{isLoading && (<div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm">
							<div className="bg-background/95 p-6 border rounded-xl shadow-lg text-center space-y-3 max-w-md mx-4">
								<h3 className="font-medium">Loading Timeline</h3>
								<p className="text-sm text-muted-foreground">
									Fetching your recorded frames...
								</p>
								<lucide_react_1.Loader2 className="h-5 w-5 animate-spin mx-auto mt-2"/>
							</div>
						</div>)}

					{!error && message && (<div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm">
							<div className="bg-background/95 p-6 border rounded-xl shadow-lg text-center space-y-3 max-w-md mx-4">
								<h3 className="font-medium">Processing</h3>
								<p className="text-sm text-muted-foreground">{message}</p>
								<lucide_react_1.Loader2 className="h-5 w-5 animate-spin mx-auto mt-2"/>
							</div>
						</div>)}

					{error && (<div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm">
							<div className="bg-destructive/5 p-6 border-destructive/20 border rounded-xl text-center space-y-4 max-w-md mx-4">
								<div className="flex flex-col items-center gap-2">
									<lucide_react_1.AlertCircle className="h-6 w-6 text-destructive"/>
									<h3 className="font-medium text-destructive">
										Connection Error
									</h3>
								</div>
								<p className="text-sm text-muted-foreground">
									Unable to reach your screenpipe data. Please verify that the
									screenpipe turned on.
								</p>
								<button onClick={handleRefresh} className="flex items-center gap-2 px-4 py-2 bg-background hover:bg-muted transition-colors rounded-lg border border-input mx-auto">
									<lucide_react_1.RotateCcw className="h-4 w-4"/>
									<span>Reload Timeline</span>
								</button>
							</div>
						</div>)}
					{currentFrame && (<img 
        //src={`data:image/png;base64,${imageFrame}`}
        src={`http://localhost:3030/frames/${currentFrame.devices[0].frame_id}`} className="absolute inset-0 w-4/5 h-auto max-h-[75vh] object-contain mx-auto border rounded-xl p-2 mt-20" alt="Current frame"/>)}
					{currentFrame && (<audio_transcript_1.AudioTranscript frames={frames} currentIndex={currentIndex} groupingWindowMs={30000} // 30 seconds window
        />)}
				</div>

				<timeline_1.TimelineSlider frames={frames} currentIndex={currentIndex} onFrameChange={(index) => {
            setCurrentIndex(index);
            if (frames[index]) {
                setCurrentFrame(frames[index]);
            }
        }} fetchNextDayData={fetchNextDayData} currentDate={currentDate} startAndEndDates={startAndEndDates}/>

				<ai_panel_1.AIPanel position={aiPanelPosition} onPositionChange={setAiPanelPosition} onClose={() => {
            setIsAiPanelExpanded(false);
        }} frames={frames} agents={agents_1.AGENTS} isExpanded={isAiPanelExpanded} onExpandedChange={setIsAiPanelExpanded}/>

				<div className="fixed left-12 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					<div className="flex flex-col items-center gap-1">
						<span>▲</span>
						<span>scroll</span>
						<span>▼</span>
					</div>
				</div>
			</div>
		</use_timeline_selection_1.TimelineProvider>);
}
