import { DeviceFrameResponse, StreamTimeSeriesResponse } from "@/app/page";
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
		fetchTimeRange,
		fetchNextDayData,
		websocket,
	} = useTimelineStore();

	useEffect(() => {
		// First establish WebSocket connection
		connectWebSocket();
	}, []); // Only connect once when component mounts

	useEffect(() => {
		// Only fetch data when WebSocket is connected
		if (websocket && websocket.readyState === WebSocket.OPEN) {
			const startTime = new Date(currentDate);
			startTime.setHours(0, 0, 0, 0);

			const endTime = new Date(currentDate);
			if (endTime.getDate() === new Date().getDate()) {
				endTime.setMinutes(endTime.getMinutes() - 5);
			} else {
				endTime.setHours(23, 59, 59, 999);
			}

			fetchTimeRange(startTime, endTime);

			// Set initial frame if available
			if (frames.length > 0) {
				setCurFrame(frames[0]);
			}
		}
	}, [websocket?.readyState]); // Depend on WebSocket connection state

	return {
		frames,
		isLoading,
		error,
		message,
		fetchNextDayData,
	};
}
