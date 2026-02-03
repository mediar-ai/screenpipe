import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { useEffect, useState } from "react";
import { useTimelineStore } from "./use-timeline-store";

export const useCurrentFrame = (setCurrentIndex: (index: number) => void) => {
	const [currentFrame, setCurrentFrame] =
		useState<StreamTimeSeriesResponse | null>(null);

	const { frames, isLoading } = useTimelineStore();

	// Select first frame (most recent) when frames load and no frame is selected
	useEffect(() => {
		if (!currentFrame && frames.length > 0) {
			setCurrentFrame(frames[0]);
			setCurrentIndex(0);
		}
	}, [isLoading, frames, currentFrame, setCurrentIndex]);



	return {
		currentFrame,
		setCurrentFrame,
	};
};

