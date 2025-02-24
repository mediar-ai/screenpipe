import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Loader2, Video } from "lucide-react";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { toast } from "./ui/use-toast";

export function ExportButton() {
	const [isExporting, setIsExporting] = useState(false);
	const { selectionRange } = useTimelineSelection();

	const handleExport = async () => {
		if (!selectionRange?.frameIds.length) {
			toast({
				title: "No frames selected",
				description: "Please select frames to export",
				variant: "destructive",
			});
			return;
		}

		setIsExporting(true);
		try {
			const response = await fetch("/api/export-video", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					frameIds: selectionRange.frameIds,
					fps: 30,
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to export video");
			}

			const data = await response.json();
			toast({
				title: "Video exported",
				description: "Your video has been exported successfully",
			});
		} catch (error) {
			toast({
				title: "Export failed",
				description: "Failed to export video. Please try again.",
				variant: "destructive",
			});
		} finally {
			setIsExporting(false);
		}
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
				e.preventDefault();
				if (!isExporting && selectionRange?.frameIds?.length) {
					handleExport();
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isExporting, selectionRange]);

	return (
		<Button
			variant="outline"
			onClick={handleExport}
			className="h-auto px-3 py-1 bg-background hover:bg-accent border text-foreground text-xs rounded flex items-center gap-2 transition-colors"
			disabled={isExporting || !selectionRange?.frameIds.length}
		>
			{isExporting ? (
				<Loader2 className="h-4 w-4 animate-spin mr-2" />
			) : (
				<Video className="h-4 w-4 mr-2" />
			)}
			Export Video
		</Button>
	);
}
