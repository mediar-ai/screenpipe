"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import {
	endOfDay,
	format,
	isAfter,
	isSameDay,
	startOfDay,
	subDays,
} from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";

interface TimeRange {
	start: Date;
	end: Date;
}

interface TimelineControlsProps {
	startAndEndDates: TimeRange;
	currentDate: Date;
	onDateChange: (date: Date) => void;
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
	const jumpDay = (days: number) => {
		const today = new Date();

		const newDate = endOfDay(new Date(currentDate));
		newDate.setDate(newDate.getDate() + days);

		// Prevent jumping to future dates
		if (isAfter(newDate.getDate(), today.getDate())) {
			onDateChange(today);
			return;
		}

		onDateChange(newDate);
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
				"flex items-center gap-2 p-2 bg-muted/50 rounded-md",
				className,
			)}
		>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => jumpDay(-1)}
				className="h-8 w-8"
				disabled={canGoBack}
			>
				<ChevronLeft className="h-4 w-4" />
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
					className="bg-background border rounded px-3 py-1 text-sm font-mono"
				>
					{format(currentDate, "d MMM yyyy")}
				</motion.div>
			</AnimatePresence>

			<Button
				variant="ghost"
				size="icon"
				onClick={() => jumpDay(1)}
				className="h-8 w-8"
				disabled={isAtToday}
			>
				<ChevronRight className="h-4 w-4" />
			</Button>

			<div className="h-4 w-px bg-border mx-2" />

			<Button
				variant="ghost"
				size="icon"
				onClick={onJumpToday}
				className="h-8 w-8"
				disabled={isAtToday}
			>
				<RefreshCw className="h-4 w-4" />
			</Button>
		</div>
	);
}
