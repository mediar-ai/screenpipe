import { MainImage } from "./image-card";
import { cn } from "@/lib/utils";
import { useKeywordSearchStore } from "@/lib/hooks/use-keyword-search-store";
import { Copy, Check, Link } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
	const [copied, setCopied] = useState(false);

	const currentFrame = searchResults[currentResultIndex];

	const copyUrl = async () => {
		if (currentFrame?.url && isValidURL(currentFrame.url)) {
			await navigator.clipboard.writeText(currentFrame.url);
			setCopied(true);
			toast.success("URL copied to clipboard");
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div
			className={cn(
				"grid  md:gap-4 gap-y-4 w-4/5 mx-auto min-h-[40%] max-h-[50%] max-w-[55vw] overflow-hidden",
			)}
		>
			<div className={cn("relative group w-full")}>
				<MainImage />
				{currentFrame?.url && isValidURL(currentFrame.url) && (
					<div className="absolute bottom-4 right-4 flex items-center gap-2">
						<button
							onClick={copyUrl}
							className={cn(
								"flex items-center gap-1 text-xs rounded bg-muted p-1.5 font-mono opacity-80 group-hover:opacity-100 transition-all duration-200 hover:bg-muted/80",
							)}
							title="Copy URL"
						>
							{copied ? (
								<Check className="h-3 w-3 text-green-500" />
							) : (
								<Copy className="h-3 w-3" />
							)}
						</button>
						<a
							className={cn(
								"flex items-center gap-1 text-xs rounded bg-muted p-1.5 font-mono opacity-80 group-hover:opacity-100 transition-all duration-200 hover:bg-muted/80",
							)}
							target="_blank"
							href={currentFrame.url}
							title="Open URL"
						>
							<Link className="h-3 w-3" />
							Open
						</a>
					</div>
				)}
			</div>
		</div>
	);
};
