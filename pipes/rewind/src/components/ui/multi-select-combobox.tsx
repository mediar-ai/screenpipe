import React, { useState } from "react";

// Third-party component imports
import { Check, ChevronsUpDown, LoaderCircle, X } from "lucide-react";

// Local UI component imports
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

// Utility imports
import { cn } from "@/lib/utils";

/**
 * Base interface for option items in the multi-select combobox
 * @property label - Display text for the option
 * @property value - Unique identifier for the option
 */
export interface BaseOption {
	label: string;
	value: string;
}

/**
 * Generic type for extending BaseOption with additional properties
 */
export type Option<T extends BaseOption = BaseOption> = T;

/**
 * Props interface for the MultiSelectCombobox component
 * @template T - Type extending BaseOption
 */
interface Props<T extends BaseOption> {
	/** Label for the combobox */
	label: string;
	/** Custom render function for individual options */
	renderItem: (option: T) => React.ReactNode;
	/** Custom render function for selected items display */
	renderSelectedItem: (value: string[]) => React.ReactNode;
	/** Array of available options */
	options: T[];
	/** Array of selected values */
	value: string[];
	/** Callback function when selection changes */
	onChange: (value: string[]) => void;
	/** Optional placeholder text for search input */
	placeholder?: string;

	isLoading?: Boolean;
}

/**
 * A customizable multi-select combobox component with type safety
 * @template T - Type extending BaseOption
 */
export const MultiSelectCombobox = <T extends BaseOption>({
	label,
	renderItem,
	renderSelectedItem,
	options,
	value,
	onChange,
	placeholder,
	isLoading,
}: Props<T>) => {
	// State for controlling popover visibility
	const [open, setOpen] = useState(false);

	/**
	 * Handles the selection/deselection of an option
	 * @param currentValue - The value to toggle
	 */
	const handleChange = (currentValue: string) => {
		onChange(
			value.includes(currentValue)
				? value.filter((val) => val !== currentValue)
				: [...value, currentValue],
		);
	};

	/**
	 * Clears all selected values
	 */
	const handleClear = (e: React.MouseEvent) => {
		e.stopPropagation();
		onChange([]);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<div
					role="combobox"
					aria-expanded={open}
					aria-haspopup="listbox"
					aria-controls="multi-select-options"
					aria-label={`Select ${label}`}
					tabIndex={0}
					className="flex h-10 min-w-[200px] cursor-pointer items-center justify-start gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
					onClick={() => setOpen(!open)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							setOpen(!open);
						}
					}}
				>
					{/* Icon and label section */}
					{
						//<ListFilter
						//  className="size-4 shrink-0 text-muted-foreground"
						//  aria-hidden="true"
						///>
					}

					{isLoading && (
						<LoaderCircle
							className={cn("size-4 shrink-0 text-muted-foreground hidden", {
								"block animate-spin": isLoading,
							})}
							aria-hidden="true"
						/>
					)}

					{
						//       value.length > 0 && (
						//	<span className="text-muted-foreground">{label}</span>
						//)
					}

					{/* Selected items display */}
					<div className="flex-1 overflow-hidden h-full text-muted-foreground">
						{value.length > 0
							? renderSelectedItem(value)
							: `Filter by ${label}...`}
					</div>

					{/* Control buttons */}
					<span className="z-10 ml-auto flex items-center gap-2">
						{value.length > 0 && (
							<button
								type="button"
								aria-label="Clear selection"
								className="z-10 rounded-sm opacity-50 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
								onClick={handleClear}
							>
								<X className="size-4 shrink-0" />
							</button>
						)}
						<ChevronsUpDown
							className="size-4 shrink-0 opacity-50"
							aria-hidden="true"
						/>
					</span>
				</div>
			</PopoverTrigger>

			{/* Dropdown content */}
			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				id="multi-select-options"
			>
				<Command>
					<CommandInput
						placeholder={placeholder || `Search ${label}...`}
						aria-label={`Search ${label}`}
					/>
					<CommandList>
						<CommandEmpty>No {label} found.</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option.value}
									value={option.label}
									onSelect={() => handleChange(option.value)}
									aria-selected={value.includes(option.value)}
									className={cn({
										"bg-accent text-accent-foreground": value.includes(
											option.value,
										),
									})}
								>
									{
										//<Check
										//	className={cn(
										//		"mr-2 h-4 w-4",
										//		value.includes(option.value)
										//			? "opacity-100"
										//			: "opacity-0",
										//	)}
										//	aria-hidden="true"
										///>
									}
									{renderItem(option)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
