"use client";

import { cn } from "@/lib/utils";
import { User } from "lucide-react";

// Color palette for speakers (works in light/dark mode)
const SPEAKER_COLORS = [
	"bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
	"bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
	"bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30",
	"bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
	"bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30",
	"bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
	"bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
	"bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
];

function getSpeakerColor(speakerId: number): string {
	return SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length];
}

export interface SpeakerBadgeProps {
	speakerId?: number;
	speakerName?: string;
	onClick?: () => void;
	className?: string;
}

export function SpeakerBadge({
	speakerId,
	speakerName,
	onClick,
	className,
}: SpeakerBadgeProps) {
	const isUnknown = !speakerName;
	const displayName = speakerName || `Unknown #${speakerId || "?"}`;

	const colorClass = speakerId ? getSpeakerColor(speakerId) : "";

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all",
				"hover:ring-2 hover:ring-offset-1 hover:ring-offset-background",
				isUnknown
					? "border border-dashed border-muted-foreground/50 text-muted-foreground hover:ring-muted-foreground/50"
					: cn("border", colorClass, "hover:ring-current"),
				onClick && "cursor-pointer",
				className
			)}
		>
			<User className="h-3 w-3" />
			<span className="max-w-[100px] truncate">{displayName}</span>
		</button>
	);
}
