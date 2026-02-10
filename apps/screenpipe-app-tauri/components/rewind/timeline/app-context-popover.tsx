import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { Copy, Search, X, Globe, AppWindow, Mic, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { open } from "@tauri-apps/plugin-shell";
import { commands } from "@/lib/utils/tauri";

interface AppContextData {
	frameCount: number;
	uniqueWindows: number;
	topWindows: { name: string; count: number }[];
	topUrls: { url: string; count: number }[];
}

interface AppContextPopoverProps {
	appName: string;
	appNames?: string[];
	frames: StreamTimeSeriesResponse[];
	anchor: { x: number; y: number };
	onClose: () => void;
	onSearch?: () => void;
}

export function AppContextPopover({
	appName,
	appNames,
	frames,
	anchor,
	onClose,
	onSearch,
}: AppContextPopoverProps) {
	const allApps = appNames && appNames.length > 1 ? appNames : [appName];
	const [copied, setCopied] = useState(false);

	// compute time range from frames
	const timeRange = useMemo(() => {
		if (!frames.length) return null;
		const timestamps = frames.map((f) => new Date(f.timestamp).getTime());
		return {
			start: new Date(Math.min(...timestamps)),
			end: new Date(Math.max(...timestamps)),
		};
	}, [frames]);

	// extract audio transcripts from already-loaded frames (no fetch)
	const audioTranscripts = useMemo(() => {
		const transcripts: { text: string; time: Date; speaker?: string }[] = [];
		for (const frame of frames) {
			for (const device of frame.devices) {
				for (const audio of device.audio || []) {
					if (audio.transcription?.trim()) {
						transcripts.push({
							text: audio.transcription.trim(),
							time: new Date(frame.timestamp),
							speaker: audio.speaker_name || undefined,
						});
					}
				}
			}
		}
		return transcripts;
	}, [frames]);

	// compute window/url stats from the frames we already have (no fetch needed)
	const statsFromFrames = useMemo(() => {
		const windowCounts = new Map<string, number>();
		const urlCounts = new Map<string, number>();

		for (const frame of frames) {
			for (const device of frame.devices) {
				const wn = device.metadata?.window_name;
				if (wn) windowCounts.set(wn, (windowCounts.get(wn) || 0) + 1);
				const url = device.metadata?.browser_url;
				if (url) urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
			}
		}

		const topWindows = [...windowCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([name, count]) => ({ name, count }));

		const topUrls = [...urlCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([url, count]) => ({ url, count }));

		return {
			frameCount: frames.length,
			uniqueWindows: windowCounts.size,
			topWindows,
			topUrls,
		} satisfies AppContextData;
	}, [frames]);

	const data = statsFromFrames;
	const approxMinutes = Math.max(1, Math.round((data.frameCount * 10) / 60));

	const handleCopy = () => {
		if (!timeRange) return;

		const lines = [
			`${appName} — ${format(timeRange.start, "h:mm a")} to ${format(timeRange.end, "h:mm a")}`,
			`~${approxMinutes} min`,
			"",
		];

		if (data?.topWindows.length) {
			lines.push("Windows:");
			data.topWindows.forEach((w) => lines.push(`  ${w.name}`));
			lines.push("");
		}

		if (data?.topUrls.length) {
			lines.push("URLs:");
			data.topUrls.forEach((u) => lines.push(`  ${u.url}`));
			lines.push("");
		}

		if (audioTranscripts.length) {
			lines.push("Audio:");
			audioTranscripts.slice(0, 5).forEach((t) =>
				lines.push(`  [${format(t.time, "h:mm a")}] ${t.text}`)
			);
		}

		navigator.clipboard.writeText(lines.join("\n"));
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const popover = (
		<div
			className="fixed z-[9999] w-72 bg-popover border border-border rounded-lg shadow-2xl text-xs"
			style={{
				direction: "ltr",
				left: `clamp(144px, ${anchor.x}px, calc(100vw - 144px))`,
				top: `${anchor.y}px`,
				transform: "translate(-50%, -100%) translateY(-8px)",
			}}
			onClick={(e) => e.stopPropagation()}
			onMouseDown={(e) => e.stopPropagation()}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-border">
				<div className="flex items-center gap-2 min-w-0">
					{allApps.map((name, i) => (
						<img
							key={i}
							src={`http://localhost:11435/app-icon?name=${encodeURIComponent(name)}`}
							className="w-5 h-5 rounded flex-shrink-0 object-contain"
							alt={name}
							style={i > 0 ? { marginLeft: -6 } : undefined}
						/>
					))}
					<span className="font-medium text-popover-foreground truncate">
						{allApps.length > 1 ? allApps.join(" + ") : appName}
					</span>
				</div>
				<button
					onClick={onClose}
					className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-1"
				>
					<X className="w-3 h-3" />
				</button>
			</div>

			{/* Content */}
			<div className="px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
				{/* Time summary */}
				{timeRange && (
					<div className="flex items-center gap-1.5 text-muted-foreground">
						<Clock className="w-3 h-3 flex-shrink-0" />
						<span>
							~{approxMinutes} min · {format(timeRange.start, "h:mm a")}–
							{format(timeRange.end, "h:mm a")}
						</span>
					</div>
				)}

				{/* Top windows */}
				{data.topWindows.length > 0 && (
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-muted-foreground">
							<AppWindow className="w-3 h-3 flex-shrink-0" />
							<span>{data.uniqueWindows} window{data.uniqueWindows !== 1 ? "s" : ""}</span>
						</div>
						<div className="pl-4 space-y-0.5">
							{data.topWindows.map((w, i) => (
								<div
									key={i}
									className="text-popover-foreground truncate"
									title={w.name}
								>
									{w.name}
								</div>
							))}
						</div>
					</div>
				)}

				{/* Top URLs — clickable */}
				{data.topUrls.length > 0 && (
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-muted-foreground">
							<Globe className="w-3 h-3 flex-shrink-0" />
							<span>top sites</span>
						</div>
						<div className="pl-4 space-y-0.5">
							{data.topUrls.map((u, i) => (
								<button
									key={i}
									className="flex items-center gap-1 text-blue-400 hover:text-blue-300 truncate w-full text-left transition-colors"
									title={u.url}
									onClick={() => {
										open(u.url).catch(() => {});
										commands.closeWindow("Main").catch(() => {});
									}}
								>
									<ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
									<span className="truncate">{u.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
								</button>
							))}
						</div>
					</div>
				)}

				{/* Audio transcripts */}
				{audioTranscripts.length > 0 && (
					<div className="space-y-1">
						<div className="flex items-center gap-1.5 text-muted-foreground">
							<Mic className="w-3 h-3 flex-shrink-0" />
							<span>{audioTranscripts.length} transcript{audioTranscripts.length !== 1 ? "s" : ""}</span>
						</div>
						<div className="pl-4 space-y-1">
							{audioTranscripts.slice(0, 3).map((t, i) => (
								<div key={i} className="text-popover-foreground">
									<span className="text-muted-foreground">
										{format(t.time, "h:mm a")}
									</span>{" "}
									<span className="line-clamp-1">{t.text}</span>
								</div>
							))}
							{audioTranscripts.length > 3 && (
								<div className="text-muted-foreground">
									+{audioTranscripts.length - 3} more
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Actions */}
			<div className="flex items-center gap-1 px-3 py-2 border-t border-border">
				<button
					onClick={handleCopy}
					className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
				>
					<Copy className="w-3 h-3" />
					<span>{copied ? "copied" : "copy"}</span>
				</button>
				{onSearch && (
					<button
						onClick={onSearch}
						className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
					>
						<Search className="w-3 h-3" />
						<span>search</span>
					</button>
				)}
			</div>
		</div>
	);

	return createPortal(popover, document.body);
}
