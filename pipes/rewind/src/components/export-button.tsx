import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Loader2, Video } from "lucide-react";
import { useTimelineSelection } from "@/lib/hooks/use-timeline-selection";
import { toast } from "./ui/use-toast";
import { getScreenpipeAppSettings } from "@/lib/actions/get-screenpipe-app-settings";
import { Settings } from "@screenpipe/js";
import { parseInt } from "lodash";

export function ExportButton() {
	const [isExporting, setIsExporting] = useState(false);
	const [progress, setProgress] = useState(0);
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
		setProgress(0);

		try {
			const settings = (await getScreenpipeAppSettings()) as Settings & {
				fps: number;
			};

			const sortedFrameIds = selectionRange.frameIds.sort(
				(a, b) => parseInt(a) - parseInt(b),
			);

			// Create WebSocket connection
			const ws = new WebSocket(
				`ws://localhost:3030/frames/export?frame_ids=${sortedFrameIds.join(",")}&fps=${settings.fps ?? 0.5}`,
			);

			ws.onmessage = async (event) => {
				const data = JSON.parse(event.data);

				switch (data.status) {
					case "extracting":
						setProgress(data.progress * 100);
						break;

					case "encoding":
						setProgress(50 + data.progress * 50);
						break;

					case "completed":
						if (data.video_data) {
							const filename = `screenpipe_export_${new Date()
								.toISOString()
								.replace(/[:.]/g, "-")}.mp4`;

							if ("__TAURI__" in window) {
								const tauri = window.__TAURI__ as any;
								const { save } = tauri.dialog;
								const { writeFile } = tauri.fs;

								const filePath = await save({
									filters: [
										{
											name: "Video",
											extensions: ["mp4"],
										},
									],
									defaultPath: filename,
								});

								if (filePath) {
									await writeFile(filePath, new Uint8Array(data.video_data));

									toast({
										title: "Video exported",
										description: "Your video has been exported successfully",
									});
								}
							} else {
								const blob = new Blob([new Uint8Array(data.video_data)], {
									type: "video/mp4",
								});
								const url = window.URL.createObjectURL(blob);
								const a = document.createElement("a");
								a.href = url;
								a.download = filename;
								document.body.appendChild(a);
								a.click();
								window.URL.revokeObjectURL(url);
								a.remove();

								toast({
									title: "Video exported",
									description: "Your video has been exported successfully",
								});
							}
						}
						setIsExporting(false);
						setProgress(0);
						ws.close();
						break;

					case "error":
						toast({
							title: "Export failed",
							description: data.error || "Failed to export video",
							variant: "destructive",
						});
						setIsExporting(false);
						setProgress(0);
						ws.close();
						break;
				}
			};

			ws.onerror = () => {
				if (isExporting) {
					toast({
						title: "Export failed",
						description: "Connection error. Please try again.",
						variant: "destructive",
					});
					setIsExporting(false);
					setProgress(0);
				}
			};

			ws.onclose = () => {
				if (isExporting) {
					setIsExporting(false);
					setProgress(0);
				}
			};
		} catch (error) {
			console.error(error);
			toast({
				title: "Export failed",
				description: "Failed to export video. Please try again.",
				variant: "destructive",
			});
			setIsExporting(false);
			setProgress(0);
		}
	};

	return (
		<Button
			variant="outline"
			onClick={handleExport}
			className="h-auto px-3 py-1 bg-background hover:bg-accent border text-foreground text-xs rounded flex items-center gap-2 transition-colors"
			disabled={isExporting || !selectionRange?.frameIds.length}
		>
			{isExporting ? (
				<div className="flex items-center">
					<Loader2 className="h-4 w-4 animate-spin mr-2" />
					{progress > 0 && `${Math.round(progress)}%`}
				</div>
			) : (
				<Video className="h-4 w-4 mr-2" />
			)}
			Export Video
		</Button>
	);
}
