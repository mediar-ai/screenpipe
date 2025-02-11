"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineSelection = TimelineSelection;
const use_timeline_selection_1 = require("@/lib/hooks/use-timeline-selection");
const react_1 = require("react");
function TimelineSelection({ loadedTimeRange, numChunks = 60, }) {
    const { setSelectionRange, selectionRange } = (0, use_timeline_selection_1.useTimelineSelection)();
    const [isDragging, setIsDragging] = (0, react_1.useState)(false);
    const [currentChunk, setCurrentChunk] = (0, react_1.useState)(null);
    const [startChunk, setStartChunk] = (0, react_1.useState)(null);
    const getDateFromChunk = (0, react_1.useCallback)((chunkIndex) => {
        const totalMs = loadedTimeRange.end.getTime() - loadedTimeRange.start.getTime();
        const msPerChunk = totalMs / numChunks;
        return new Date(loadedTimeRange.start.getTime() + chunkIndex * msPerChunk);
    }, [loadedTimeRange, numChunks]);
    const handleMouseDown = (e, chunkIndex) => {
        e.preventDefault(); // Prevent text selection
        setIsDragging(true);
        setStartChunk(chunkIndex);
        setCurrentChunk(chunkIndex);
        const date = getDateFromChunk(chunkIndex);
        setSelectionRange({ start: date, end: date });
    };
    const handleMouseMove = (e, chunkIndex) => {
        if (!isDragging || startChunk === null)
            return;
        setCurrentChunk(chunkIndex);
        const start = Math.min(startChunk, chunkIndex);
        const end = Math.max(startChunk, chunkIndex);
        setSelectionRange({
            start: getDateFromChunk(start),
            end: getDateFromChunk(end + 1), // +1 to include the full chunk
        });
    };
    const handleMouseUp = () => {
        setIsDragging(false);
        setStartChunk(null);
        setCurrentChunk(null);
    };
    const isChunkSelected = (0, react_1.useCallback)((chunkIndex) => {
        if (isDragging && startChunk !== null && currentChunk !== null) {
            const start = Math.min(startChunk, currentChunk);
            const end = Math.max(startChunk, currentChunk);
            return chunkIndex >= start && chunkIndex <= end;
        }
        else if (selectionRange) {
            const chunkDate = getDateFromChunk(chunkIndex);
            const nextChunkDate = getDateFromChunk(chunkIndex + 1);
            return (chunkDate >= selectionRange.start && chunkDate < selectionRange.end);
        }
        return false;
    }, [isDragging, startChunk, currentChunk, selectionRange, getDateFromChunk]);
    return (<div className="absolute inset-0 flex" onMouseLeave={handleMouseUp} onMouseUp={handleMouseUp}>
			{Array.from({ length: numChunks }).map((_, i) => (<div key={i} className={`h-full flex-1 border-r border-foreground/5 transition-colors ${isChunkSelected(i) ? "bg-primary/30" : "hover:bg-foreground/10"}`} style={{
                cursor: isDragging ? "col-resize" : "pointer",
            }} onMouseDown={(e) => handleMouseDown(e, i)} onMouseMove={(e) => handleMouseMove(e, i)}/>))}
		</div>);
}
