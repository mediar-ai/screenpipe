import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { useEffect, useRef, useState } from "react";
import { useTimelineStore } from "./use-timeline-store";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

	useEffect(() => {
		const handleWindowFocused = (isFocused: boolean) => {
			if (isFocused) {
				window.location.reload();
			}
		};

		const unlisten = listen("window-focused", (event) => {
			console.log("window-focused", event.payload);
			handleWindowFocused(event.payload as boolean);
		});

		return () => {
			unlisten.then(unlisten => unlisten());
		};
	}, []);


	return {
		currentFrame,
		setCurrentFrame,
	};
};

