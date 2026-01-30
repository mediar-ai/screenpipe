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

	// NOTE: Auto-select of first frame is handled in timeline.tsx to avoid
	// interfering with calendar navigation. Don't add frame selection here.

	return {
		frames,
		isLoading,
		error,
		message,
		fetchNextDayData,
		websocket, // Expose websocket so timeline.tsx can depend on it
	};
}

