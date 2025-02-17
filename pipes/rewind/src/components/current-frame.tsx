import { Sparkle } from "lucide-react";
import { AIFrameResponse } from "./ai-frame-response";
import { MainImage } from "./image-card";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useKeywordSearchStore } from "@/lib/hooks/use-keyword-search-store";

export const CurrentFrame = () => {
	const [openAi, setOpenAi] = useState(false);
	const { currentResultIndex, searchResults } = useKeywordSearchStore();

	useEffect(() => {
		if (!openAi) return;

		setOpenAi(false);
	}, [currentResultIndex]);

	return (
		<div
			className={cn(
				"grid  grid-cols-1 lg:grid-cols-4 md:gap-4 gap-y-4 w-4/5 mx-auto h-auto max-h-[60vh] max-w-[50vw] overflow-hidden",
				{
					"lg:grid-cols-2 w-4/6": !openAi,
				},
			)}
		>
			<div
				className={cn("col-span-3 relative group w-full", {
					"col-span-2": !openAi,
				})}
			>
				<MainImage />
				{
					//<button
					//	className={cn(
					//		"absolute text-xs rounded bottom-4 right-4 bg-background/80 p-1 h-auto opacity-0 group-hover:opacity-100 transition-all duration-200",
					//		{
					//			"group-hover:opacity-100": Boolean(
					//				searchResults[currentResultIndex],
					//			),
					//		},
					//	)}
					//	onClick={() => setOpenAi(!openAi)}
					//>
					//	{openAi ? "hide" : "show"} ai response
					//</button>
				}
			</div>
			{Boolean(searchResults[currentResultIndex]) && openAi && (
				<div
					id="ai-response"
					className="rounded-lg bg-white/80 backdrop-blur-sm border max-h-[50vh] h-full border-neutral-200 p-6 shadow-sm overflow-y-auto"
				>
					<h2 className="font-medium text-neutral-900 mb-2">
						<span className="flex gap-2 items-center">
							<Sparkle />
							<span>AI</span>
						</span>
					</h2>
					<AIFrameResponse />
				</div>
			)}
		</div>
	);
};
