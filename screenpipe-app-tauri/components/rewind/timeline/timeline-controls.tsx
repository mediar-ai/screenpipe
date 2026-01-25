"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import {
	endOfDay,
	format,
	isAfter,
	startOfDay,
	subDays,
} from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { usePlatform } from "@/lib/hooks/use-platform";

interface TimeRange {
	start: Date;
	end: Date;
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
	const { isMac } = usePlatform();

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
			<div className="flex items-center gap-2 mt-8">
				<div className="flex items-center h-10 bg-background border border-border px-1">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => jumpDay(-1)}
						className="h-8 w-8 text-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
						disabled={canGoBack}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>

					<AnimatePresence mode="wait">
						<motion.div
							key={currentDate.toISOString()}
							initial={{ y: -10, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: 10, opacity: 0 }}
							transition={{
								type: "spring",
								stiffness: 500,
								damping: 30,
								duration: 0.15,
							}}
							className="px-3 text-sm font-mono text-foreground min-w-[100px] text-center"
						>
							{format(currentDate, "d MMM yyyy")}
						</motion.div>
					</AnimatePresence>

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
						disabled={isAtToday}
					>
						<RefreshCw className="h-4 w-4" />
					</Button>
				</div>

				<div className="flex items-center h-10 gap-1.5 bg-background border border-border px-4 font-mono">
					<span className="text-xs text-muted-foreground">{isMac ? "⌘K" : "Ctrl+K"}</span>
					<span className="text-xs text-foreground">search</span>
				</div>
			</div>

			
		</div>
	);
}