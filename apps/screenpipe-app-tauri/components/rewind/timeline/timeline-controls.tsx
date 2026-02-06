"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw, CalendarIcon } from "lucide-react";
import {
	endOfDay,
	format,
	isAfter,
	isSameDay,
	startOfDay,
	subDays,
} from "date-fns";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { usePlatform } from "@/lib/hooks/use-platform";
import { useSettings } from "@/lib/hooks/use-settings";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

// Helper to format shortcut string for display
function formatShortcutForDisplay(shortcut: string, isMac: boolean): string {
	if (!shortcut) return isMac ? "⌃⌘K" : "Ctrl+Alt+K";

	const parts = shortcut.split("+");
	const formatted = parts.map((part) => {
		const upper = part.toUpperCase();
		if (isMac) {
			switch (upper) {
				case "CONTROL":
				case "CTRL":
					return "⌃";
				case "SUPER":
				case "CMD":
				case "COMMAND":
					return "⌘";
				case "ALT":
				case "OPTION":
					return "⌥";
				case "SHIFT":
					return "⇧";
				default:
					return part.toUpperCase();
			}
		} else {
			switch (upper) {
				case "SUPER":
				case "CMD":
				case "COMMAND":
					return "Win";
				case "CONTROL":
					return "Ctrl";
				case "OPTION":
					return "Alt";
				default:
					return part;
			}
		}
	});

	return isMac ? formatted.join("") : formatted.join("+");
}

interface TimeRange {
	start: Date;
	end: Date;
}

interface TimelineControlsProps {
	startAndEndDates: TimeRange;
	currentDate: Date;
	onDateChange: (date: Date) => Promise<any>;
	onJumpToday: () => void;
	onSearchClick?: () => void;
	className?: string;
}

export function TimelineControls({
	startAndEndDates,
	currentDate,
	onDateChange,
	onJumpToday,
	onSearchClick,
	className,
}: TimelineControlsProps) {
	const { isMac } = usePlatform();
	const { settings } = useSettings();
	const [calendarOpen, setCalendarOpen] = useState(false);

	const searchShortcutDisplay = useMemo(
		() => formatShortcutForDisplay(settings.searchShortcut ?? "Control+Super+K", isMac),
		[settings.searchShortcut, isMac]
	);

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

	// Disable forward button and jump-to-today if we're already at today
	const isAtToday = useMemo(
		() => isSameDay(new Date(), currentDate),
		[currentDate],
	);

	// Disable back button if we're at or before the earliest recorded date
	const isAtEarliestDate = useMemo(() => {
		const previousDay = subDays(currentDate, 1);
		// Disabled if previous day would be before the start date
		return isAfter(startOfDay(startAndEndDates.start), startOfDay(previousDay));
	}, [startAndEndDates.start, currentDate]);

	return (
		<div
			className={cn(
				"flex items-center justify-center w-full",
				className,
			)}
		>
			
			
			{/* Center section - Timeline controls */}
			<div className="flex items-center gap-2 mt-8">
				<div className="flex items-center h-10 bg-background border border-border px-1">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => jumpDay(-1)}
						className="h-8 w-8 text-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
						disabled={isAtEarliestDate}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>

					<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="px-3 h-8 text-sm font-mono text-foreground min-w-[100px] text-center hover:bg-foreground hover:text-background transition-colors duration-150 flex items-center justify-center gap-2"
							>
								<CalendarIcon className="h-3 w-3" />
								<span>{format(currentDate, "d MMM yyyy")}</span>
							</button>
						</PopoverTrigger>
						<PopoverContent
						className="w-auto p-0 z-[200]"
						align="center"
						sideOffset={8}
					>
						<div
							onClick={(e) => e.stopPropagation()}
							onMouseDown={(e) => e.stopPropagation()}
							onPointerDown={(e) => e.stopPropagation()}
						>
							<Calendar
								mode="single"
								selected={currentDate}
								onSelect={(date) => {
									console.log("[Calendar] onSelect called with:", date?.toISOString(), "currentDate:", currentDate.toISOString());
									if (date) {
										onDateChange(date);
										setCalendarOpen(false);
									}
								}}
								disabled={(date) =>
									isAfter(startOfDay(date), startOfDay(new Date())) ||
									isAfter(startOfDay(startAndEndDates.start), startOfDay(date))
								}
							/>
						</div>
					</PopoverContent>
					</Popover>

					<Button
						variant="ghost"
						size="icon"
						onClick={() => jumpDay(1)}
						className="h-8 w-8 text-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
						disabled={isAtToday}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>

					<Button
						variant="ghost"
						size="icon"
						onClick={onJumpToday}
						className="h-8 w-8 text-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
						title="Jump to now"
					>
						<RefreshCw className="h-4 w-4" />
					</Button>
				</div>

				<button
					type="button"
					onClick={onSearchClick}
					className="flex items-center h-10 gap-1.5 bg-background border border-border px-4 font-mono hover:bg-foreground hover:text-background transition-colors duration-150 cursor-pointer group"
				>
					<span className="text-xs text-muted-foreground group-hover:text-background">{searchShortcutDisplay}</span>
					<span className="text-xs text-foreground group-hover:text-background">search</span>
				</button>
			</div>

			
		</div>
	);
}