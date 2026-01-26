"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2 } from "lucide-react";
import { SpeakerAssignPopover } from "@/components/speaker-assign-popover";
import { VideoComponent } from "@/components/rewind/video";

// Consistent color palette for speakers
const SPEAKER_COLORS = [
	{ bg: "bg-blue-500/10", border: "border-l-blue-500", text: "text-blue-600 dark:text-blue-400" },
	{ bg: "bg-emerald-500/10", border: "border-l-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
	{ bg: "bg-violet-500/10", border: "border-l-violet-500", text: "text-violet-600 dark:text-violet-400" },
	{ bg: "bg-amber-500/10", border: "border-l-amber-500", text: "text-amber-600 dark:text-amber-400" },
	{ bg: "bg-rose-500/10", border: "border-l-rose-500", text: "text-rose-600 dark:text-rose-400" },
	{ bg: "bg-cyan-500/10", border: "border-l-cyan-500", text: "text-cyan-600 dark:text-cyan-400" },
	{ bg: "bg-fuchsia-500/10", border: "border-l-fuchsia-500", text: "text-fuchsia-600 dark:text-fuchsia-400" },
	{ bg: "bg-lime-500/10", border: "border-l-lime-500", text: "text-lime-600 dark:text-lime-400" },
];

function getSpeakerColor(speakerId: number | undefined) {
	if (speakerId === undefined) {
		return { bg: "bg-muted/50", border: "border-l-muted-foreground/30", text: "text-muted-foreground" };
	}
	return SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length];
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	const mins = Math.floor(seconds / 60);
	const secs = Math.round(seconds % 60);
	return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export interface ConversationBubbleProps {
	audioChunkId: number;
	speakerId?: number;
	speakerName?: string;
	transcription: string;
	audioFilePath: string;
	durationSecs: number;
	timestamp: Date;
	isInput: boolean;
	side: "left" | "right";
	isFirstInGroup: boolean;
	isPlaying: boolean;
	onPlay: () => void;
	onSpeakerAssigned: (newId: number, newName: string) => void;
}

export function ConversationBubble({
	audioChunkId,
	speakerId,
	speakerName,
	transcription,
	audioFilePath,
	durationSecs,
	timestamp,
	isInput,
	side,
	isFirstInGroup,
	isPlaying,
	onPlay,
	onSpeakerAssigned,
}: ConversationBubbleProps) {
	const colors = getSpeakerColor(speakerId);
	const isUnknown = !speakerName;
	const displayName = speakerName || `Unknown #${speakerId ?? "?"}`;

	return (
		<div
			className={cn(
				"flex w-full",
				side === "right" ? "justify-end" : "justify-start"
			)}
		>
			<div
				className={cn(
					"max-w-[85%] rounded-2xl border-l-4 transition-all",
					colors.bg,
					colors.border,
					isFirstInGroup ? "mt-3" : "mt-1",
					// Subtle animation on mount
					"animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
				)}
			>
				{/* Header - only show for first in group or if different speaker */}
				{isFirstInGroup && (
					<div className="flex items-center gap-2 px-3 pt-2 pb-1">
						<SpeakerAssignPopover
							audioChunkId={audioChunkId}
							speakerId={speakerId}
							speakerName={speakerName}
							audioFilePath={audioFilePath}
							onAssigned={onSpeakerAssigned}
						/>
						<span className="text-[10px] text-muted-foreground">
							{formatTime(timestamp)}
						</span>
						{!isInput && (
							<span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
								remote
							</span>
						)}
					</div>
				)}

				{/* Content */}
				<div className="px-3 pb-2">
					{transcription ? (
						<p className="text-sm leading-relaxed text-foreground">
							{transcription}
						</p>
					) : (
						<p className="text-sm italic text-muted-foreground">
							(no transcription)
						</p>
					)}

					{/* Audio controls */}
					<div className="flex items-center gap-2 mt-2">
						<Button
							variant="ghost"
							size="sm"
							className={cn(
								"h-7 px-2 gap-1.5 text-xs",
								isPlaying && "bg-accent"
							)}
							onClick={onPlay}
						>
							{isPlaying ? (
								<Pause className="h-3 w-3" />
							) : (
								<Play className="h-3 w-3" />
							)}
							<span>{formatDuration(durationSecs)}</span>
						</Button>
					</div>

					{/* Audio player */}
					{isPlaying && (
						<div className="mt-2 rounded-lg overflow-hidden">
							<VideoComponent filePath={audioFilePath} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// Time gap divider component
export function TimeGapDivider({ minutes }: { minutes: number }) {
	return (
		<div className="flex items-center gap-3 py-3">
			<div className="flex-1 h-px bg-border" />
			<span className="text-[10px] text-muted-foreground px-2">
				{minutes < 60 ? `${minutes} min later` : `${Math.round(minutes / 60)}h later`}
			</span>
			<div className="flex-1 h-px bg-border" />
		</div>
	);
}

// Participant summary component
export function ParticipantsSummary({
	participants,
	totalDuration,
	timeRange,
}: {
	participants: Array<{ id: number; name: string; duration: number }>;
	totalDuration: number;
	timeRange: { start: Date; end: Date };
}) {
	return (
		<div className="px-3 py-2 border-b border-border bg-muted/30">
			<div className="flex items-center justify-between text-xs">
				<div className="flex items-center gap-2 flex-wrap">
					{participants.map((p) => {
						const colors = getSpeakerColor(p.id);
						const percentage = Math.round((p.duration / totalDuration) * 100);
						return (
							<div
								key={p.id}
								className={cn(
									"flex items-center gap-1 px-2 py-0.5 rounded-full",
									colors.bg
								)}
							>
								<span className={cn("font-medium", colors.text)}>
									{p.name || `Unknown #${p.id}`}
								</span>
								<span className="text-muted-foreground text-[10px]">
									{percentage}%
								</span>
							</div>
						);
					})}
				</div>
				<div className="text-muted-foreground text-[10px]">
					{formatTime(timeRange.start)} - {formatTime(timeRange.end)}
				</div>
			</div>
		</div>
	);
}
