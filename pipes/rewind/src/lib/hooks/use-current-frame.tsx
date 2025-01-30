import { StreamTimeSeriesResponse } from "@/app/page";
import { useEffect, useRef, useState } from "react";
import { useTimelineStore } from "./use-timeline-store";

interface CurrentFrameProps {
	setCurrentIndex: (index: number) => void;
}

export const useCurrentFrame = (setCurrentIndex: (index: number) => void) => {
	const [currentFrame, setCurrentFrame] =
		useState<StreamTimeSeriesResponse | null>(null);

	const [imageFrame, setImageFrame] = useState<string | null>(null);

	const { frames, isLoading } = useTimelineStore();
	const lastFramesLen = useRef<number>(0);

	useEffect(() => {
		const fetchFrameData = async (frameId: number): Promise<string> => {
			const response = await fetch(`http://localhost:3030/frames/${frameId}`);
			if (!response.ok) {
				fetchFrameData(frameId + 1);
			}
			const res = await response.json();
			setImageFrame(res.data);
			return res.data;
		};

		if (currentFrame) {
			fetchFrameData(parseInt(currentFrame?.devices[0]?.frame_id));
		} else {
			setImageFrame(null);
		}

		//if (currentFrame) {
		//	setImageFrame(currentFrame.devices[0].frame);
		//} else {
		//	setImageFrame(null);
		//}
	}, [currentFrame]);

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
		imageFrame,
	};
};
