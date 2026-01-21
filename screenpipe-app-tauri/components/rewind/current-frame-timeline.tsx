import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import React, { FC, useState, useEffect, useRef } from "react";

interface CurrentFrameTimelineProps {
	currentFrame: StreamTimeSeriesResponse;
}

export const SkeletonLoader: FC = () => {
	return (
		<div className="absolute inset-0 w-full h-full bg-gray-900/50 overflow-hidden">
			<div
				className="w-full h-full bg-gradient-to-r from-gray-800/30 via-gray-600/30 to-gray-800/30 animate-shimmer"
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
	const [retryCount, setRetryCount] = useState(0);
	const imageRef = useRef<HTMLImageElement>(null);

	const frameId = currentFrame?.devices?.[0]?.frame_id;
	// Simple image URL without cache busting
	const imageUrl = `http://localhost:3030/frames/${frameId}`;

	// Reset loading state when frame changes, but be smarter about it
	React.useEffect(() => {
		if (frameId && !imageRef.current?.complete) {
			setIsLoading(true);
			setHasError(false);
			setRetryCount(0);
		} 	}, [frameId ]);

	const handleRetry = () => {
		if (retryCount < 3) {
			setRetryCount(prev => prev + 1);
			setIsLoading(true);
			setHasError(false);
		}
	};

	if (!frameId) {
		return (
			<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
				<div className="text-center text-muted-foreground">
					<h3 className="text-lg font-medium mb-2">No Frame ID</h3>
					<p className="text-sm">Frame data is missing or invalid</p>
				</div>
			</div>
		);
	}

	return (
		<div className="absolute inset-0 w-full h-full">
			{isLoading && <SkeletonLoader />}
			<img
				src={imageUrl}
				ref={imageRef}
				className="absolute inset-0 w-full h-full object-cover"
				style={{
					zIndex: 1,
					display: hasError ? 'none' : 'block',
					opacity: isLoading ? 0 : 1,
					transition: 'opacity 0.2s ease-in-out',
				}}
				alt="Current frame"
				onLoad={() => {
					console.log('Image loaded successfully for frame:', frameId);
					setIsLoading(false);
					setHasError(false);
				}}
				onError={() => {
					console.log('Image failed to load for frame:', frameId);
					setIsLoading(false);
					setHasError(true);
				}}
			/>
			{hasError && !isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 z-10">
					<div className="text-center text-muted-foreground">
						<h3 className="text-lg font-medium mb-2">Image Failed to Load</h3>
						<p className="text-sm">Could not load frame image</p>
						<p className="text-xs mt-2 opacity-50 font-mono">{frameId}</p>
						<div className="flex gap-2 mt-3">
							{retryCount < 3 && (
								<button 
									onClick={handleRetry}
									className="px-3 py-1 bg-blue-600/80 hover:bg-blue-600 rounded text-xs transition-colors"
								>
									Retry ({retryCount}/3)
								</button>
							)}
							<button 
								onClick={() => window.open(`http://localhost:3030/frames/${frameId}`, '_blank')}
								className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"
							>
								Open in browser
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
