"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw, Mail, User, Settings2, Book, Heart, Play, Folder } from "lucide-react";
import {
	endOfDay,
	format,
	isAfter,
	startOfDay,
	subDays,
} from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { open } from "@tauri-apps/plugin-shell";
import HealthStatus from "@/components/screenpipe-status";
import { ShareLogsButton } from "@/components/share-logs-button";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { openSettingsWindow } from "@/lib/utils/window";
import { commands } from "@/lib/utils/tauri";

import { CommandShortcut } from "@/components/ui/command";

interface TimeRange {
	start: Date;
	end: Date;
}

interface InboxMessageAction {
	label: string;
	action: string;
}

interface Message {
	id: string;
	title: string;
	body: string;
	date: string;
	read: boolean;
	actions?: InboxMessageAction[];
}

interface TimelineControlsProps {
	startAndEndDates: TimeRange;
	currentDate: Date;
	onDateChange: (date: Date) => Promise<any>;
	onJumpToday: () => void;
	className?: string;
}

export function TimelineControls({
	startAndEndDates,
	currentDate,
	onDateChange,
	onJumpToday,
	className,
}: TimelineControlsProps) {
	const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

	const { setShowChangelogDialog } = useChangelogDialog();

	const handleShowOnboarding = async () => {
		try {
			await commands.showWindow("Onboarding");
		} catch (error) {
			console.error("Failed to show onboarding window:", error);
		}
	};

	const jumpDay = async (days: number) => {
		const today = new Date();

		const newDate = endOfDay(new Date(currentDate));
		newDate.setDate(newDate.getDate() + days);

		// Prevent jumping to future dates
		if (isAfter(startOfDay(newDate), startOfDay(today))) {
			await onDateChange(today);
			return;
		}

		await onDateChange(newDate);
	};

	// Disable forward button if we're at today
	const isAtToday = useMemo(
		() => !isAfter(startOfDay(new Date()), startOfDay(currentDate)),
		[currentDate],
	);

	const canGoBack = useMemo(
		() =>
			isAfter(
				startOfDay(startAndEndDates.start),
				startOfDay(subDays(currentDate, 1)),
			),
		[startAndEndDates.start, currentDate],
	);

	return (
		<div
			className={cn(
				"flex items-center justify-center w-full",
				className,
			)}
		>
			
			
			{/* Center section - Timeline controls */}
			<div className="flex items-center gap-4">	
				<div className="flex items-center gap-1 bg-card border border-border rounded-2xl p-1 shadow-2xl">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => jumpDay(-1)}
						className="h-9 w-9 text-foreground hover:bg-accent hover:text-accent-foreground border-0 rounded-xl"
						disabled={canGoBack}
					>
						<ChevronLeft className="h-5 w-5" />
					</Button>

					<AnimatePresence mode="wait">
						<motion.div
							key={currentDate.toISOString()}
							initial={{ y: -20, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: 20, opacity: 0 }}
							transition={{
								type: "spring",
								stiffness: 500,
								damping: 30,
								duration: 0.2,
							}}
							className="bg-card border border-border rounded-xl px-4 py-2 text-sm font-medium text-foreground min-w-[120px] text-center"
						>
							{format(currentDate, "d MMM yyyy")}
						</motion.div>
					</AnimatePresence>

					<Button
						variant="ghost"
						size="icon"
						onClick={() => jumpDay(1)}
						className="h-9 w-9 text-foreground hover:bg-accent hover:text-accent-foreground border-0 rounded-xl"
						disabled={isAtToday}
					>
						<ChevronRight className="h-5 w-5" />
					</Button>

					<div className="h-5 w-px bg-white/20 mx-1" />

					<Button
						variant="ghost"
						size="icon"
						onClick={onJumpToday}
						className="h-9 w-9 text-foreground hover:bg-accent hover:text-accent-foreground border-0 rounded-xl"
						disabled={isAtToday}
					>
						<RefreshCw className="h-5 w-5" />
					</Button>
				</div>
				
				<div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2">
					<CommandShortcut className="text-muted-foreground">⌘K</CommandShortcut>
					<span className="text-xs text-muted-foreground">to search</span>
				</div>
			</div>

			
		</div>
	);
}