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
import { Settings } from "@/components/settings";
import { ShareLogsButton } from "@/components/share-logs-button";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { useChangelogDialog } from "@/lib/hooks/use-changelog-dialog";
import { useSettingsDialog } from "@/lib/hooks/use-settings-dialog";

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

	const { setShowOnboarding } = useOnboarding();
	const { setShowChangelogDialog } = useChangelogDialog();
	const { setIsOpen: setSettingsOpen } = useSettingsDialog();

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
				"flex items-center justify-between w-full p-2 rounded-md",
				className,
			)}
		>
			{/* Empty left section for balance */}
			<div className="flex-1" />
			
			{/* Center section - Timeline controls */}
			<div className="flex items-center gap-2">	
			<div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 shadow-lg">
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
						<div>
							<CommandShortcut>⌘K</CommandShortcut>{" "}
							<span className="text-xs text-muted-foreground">to search</span>
						</div>
			</div>

			{/* Right section - Header elements */}
			<div className="flex items-center gap-2 flex-1 justify-end">
				<Popover open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm">
							<Mail className="h-3.5 w-3.5 mr-2" />
							feedback
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-100 rounded-2xl">
						<ShareLogsButton 
							showShareLink={false} 
							onComplete={() => setIsFeedbackOpen(false)} 
						/>
					</PopoverContent>
				</Popover>

				<HealthStatus className="cursor-pointer" />
				<Settings />

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="cursor-pointer h-8 w-8 p-0"
						>
							<User className="h-4 w-4" />
							<span className="sr-only">user menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>account</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem
								onSelect={(e) => {
									e.preventDefault();
									setSettingsOpen(true);
								}}
								className="cursor-pointer p-1.5"
							>
								<Settings2 className="mr-2 h-4 w-4" />
								<span>settings</span>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => open("https://docs.screenpi.pe")}
							>
								<Book className="mr-2 h-4 w-4" />
								<span>check docs</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() =>
									open(
										"https://twitter.com/intent/tweet?text=here's%20how%20i%20use%20@screen_pipe%20...%20%5Bscreenshot%5D%20an%20awesome%20tool%20for%20..."
									)
								}
							>
								<Heart className="mr-2 h-4 w-4" />
								<span>support us</span>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => setShowOnboarding(true)}
							>
								<Play className="mr-2 h-4 w-4" />
								<span>show onboarding</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => setShowChangelogDialog(true)}
							>
								<Folder className="mr-2 h-4 w-4" />
								<span>show changelog</span>
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}