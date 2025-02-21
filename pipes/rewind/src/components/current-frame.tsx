import { MainImage } from "./image-card";
import { cn } from "@/lib/utils";
import { useKeywordSearchStore } from "@/lib/hooks/use-keyword-search-store";

function isValidURL(url: string) {
	try {
		new URL(url);
		return true;
	} catch (error) {
		return false;
	}
}

export const CurrentFrame = () => {
	const { currentResultIndex, searchResults } = useKeywordSearchStore();

	const currentFrame = searchResults[currentResultIndex];

	return (
		<div
			className={cn(
				"grid  md:gap-4 gap-y-4 w-4/5 mx-auto h-auto max-h-[60vh] max-w-[50vw] overflow-hidden",
			)}
		>
			<div className={cn("relative group w-full")}>
				<MainImage />
				{currentFrame?.url && isValidURL(currentFrame.url) && (
					<a
						className={cn(
							"absolute text-xs rounded bottom-4 right-4 bg-muted  p-1 font-mono opacity-80 group-hover:opacity-100 transition-all duration-200",
						)}
						target="_blank"
						href={currentFrame.url}
					>
						Open URL
					</a>
				)}
			</div>
		</div>
	);
};
