import { StreamTimeSeriesResponse } from "@/app/page";
import { FC, useState } from "react";

interface CurrentFrameTimelineProps {
	currentFrame: StreamTimeSeriesResponse;
}

export const SkeletonLoader: FC = () => {
	return (
		<div className="absolute inset-0 w-4/5 h-[75vh] mx-auto mt-20 border rounded-xl p-2 bg-gray-100 overflow-hidden">
			<div
				className="w-full h-full bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-shimmer"
				style={{
					backgroundSize: "200% 100%",
					animation: "shimmer 1.5s infinite linear",
				}}
			/>
		</div>
	);
};

export const CurrentFrameTimeline: FC<CurrentFrameTimelineProps> = ({
	currentFrame,
}) => {
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);

	return (
		<>
			{(isLoading || hasError) && <SkeletonLoader />}
			<img
				src={`http://localhost:3030/frames/${currentFrame.devices[0].frame_id}`}
				className={`absolute inset-0 w-4/5 h-auto max-h-[75vh] object-contain mx-auto border rounded-xl p-2 mt-20 transition-opacity duration-300 ${
					isLoading || hasError ? "opacity-0" : "opacity-100"
				}`}
				alt="Current frame"
				onLoad={() => {
					setIsLoading(false);
					setHasError(false);
				}}
				onError={() => {
					setIsLoading(false);
					setHasError(true);
				}}
			/>
		</>
	);
};
