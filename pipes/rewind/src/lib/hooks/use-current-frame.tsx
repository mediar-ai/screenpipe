import { StreamTimeSeriesResponse } from "@/app/page";
import { useEffect, useRef, useState } from "react";
import { useTimelineStore } from "./use-timeline-store";

export const useCurrentFrame = (setCurrentIndex: (index: number) => void) => {
	const [currentFrame, setCurrentFrame] =
		useState<StreamTimeSeriesResponse | null>(null);

	const { frames, isLoading } = useTimelineStore();
	const lastFramesLen = useRef<number>(0);

	useEffect(() => {
		if (!currentFrame && frames.length) {
			setCurrentFrame(frames[lastFramesLen.current]);
			setCurrentIndex(lastFramesLen.current);
		}
		lastFramesLen.current = frames.length;
	}, [isLoading, frames]);

	return {
		currentFrame,
		setCurrentFrame,
	};
};
