"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { SelectRangeEventHandler } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContentInDialog as PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

export function DatePickerWithRange({
	className,
	start_time,
	end_time,
	disabled,
	setDateRange,
}: React.HTMLAttributes<HTMLDivElement> & {
	start_time: Date | null;
	end_time: Date | null;
	setDateRange: SelectRangeEventHandler;
	disabled?: boolean | undefined;
}) {
	return (
		<div className={cn("grid gap-2 w-full h-full", className)}>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						id="date"
						disabled={disabled}
						variant={"outline"}
						className={cn(
							"w-full h-full justify-start text-left font-normal",
							!start_time && "text-muted-foreground",
						)}
					>
						<CalendarIcon />
						{start_time ? (
							end_time ? (
								<>
									{format(start_time, "LLL dd, y")} -{" "}
									{format(end_time, "LLL dd, y")}
								</>
							) : (
								format(start_time, "LLL dd, y")
							)
						) : (
							<span>Filter by Date</span>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						initialFocus
						mode="range"
						defaultMonth={start_time ?? undefined}
						selected={{
							from: start_time ?? undefined,
							to: end_time ?? undefined,
						}}
						onSelect={setDateRange}
						numberOfMonths={2}
						disabled={{
							after: new Date(),
						}}
						toMonth={new Date()}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
