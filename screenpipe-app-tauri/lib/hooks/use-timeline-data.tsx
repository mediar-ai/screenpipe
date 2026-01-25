import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { useTimelineStore } from "./use-timeline-store";
import { useEffect } from "react";

export function useTimelineData(
	currentDate: Date,
	setCurFrame: (frame: StreamTimeSeriesResponse) => void,
) {
	const {
		frames,
		isLoading,
		error,
		message,
		connectWebSocket,
		fetchNextDayData,
		websocket,
	} = useTimelineStore();

	useEffect(() => {
		// Establish WebSocket connection on mount
		// The connectWebSocket function handles closing existing connections
		connectWebSocket();
	}, []); // Only connect once when component mounts

	// Set initial frame when frames arrive and no frame is selected yet
	useEffect(() => {
		if (frames.length > 0) {
			setCurFrame(frames[0]);
		}
	}, [frames.length > 0]); // Only trigger when we go from 0 to some frames

	return {
		frames,
		isLoading,
		error,
		message,
		fetchNextDayData,
		websocket, // Expose websocket so timeline.tsx can depend on it
	};
}

