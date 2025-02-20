"use client";

import * as React from "react";

import { useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import { MultiSelectCombobox } from "./ui/multi-select-combobox";
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import { Dialog, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { DatePickerWithRange } from "./date-range-picker";
import { queryParser, QueryParser, querySerializer } from "@/lib/utils";
import { CustomDialogContent } from "./custom-dialog-content";
import { ArrowRight, XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import { CommandShortcut } from "./ui/command";

export function SearchCommand() {
	const [open, setOpen] = React.useState(false);

	const [state] = useQueryStates(queryParser);
	const [options, setOptions] = useState<QueryParser>(
		!state
			? {
					query: null,
					start_time: null,
					end_time: null,
					apps: [],
				}
			: state,
	);

	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};
		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			window.location.href = `/search${querySerializer(options)}`;
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTitle className="sr-only">Search Command</DialogTitle>
			<CustomDialogContent
				className="p-2 max-w-screen-sm"
				customClose={
					options.query ? (
						<a href={`/search${querySerializer(options)}`}>
							<ArrowRight className="w-4 h-4" />
						</a>
					) : (
						<XIcon className="w-4 h-4" />
					)
				}
			>
				<Input
					value={options?.query || ""}
					className="focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ring-0 outline-none border-0"
					placeholder="Search..."
					onChange={(e) => {
						setOptions((prev) => ({ ...prev, query: e.target.value }));
					}}
					onKeyDown={handleKeyDown}
				/>
				<div className="flex w-full gap-10">
					<div className="w-1/2">
						<AppSelect
							apps={options.apps || []}
							setApps={(values) => {
								setOptions((prev) => ({ ...prev, apps: values }));
							}}
						/>
					</div>
					<div className="w-1/2">
						<DatePickerWithRange
							start_time={options.start_time}
							end_time={options.end_time}
							setDateRange={(range) => {
								setOptions((prev) => ({
									...prev,
									start_time: range?.from ?? null,
									end_time: range?.to ?? null,
								}));
							}}
						/>
					</div>
				</div>
			</CustomDialogContent>
		</Dialog>
	);
}

interface AppSelectProps {
	apps: string[];
	setApps: (values: string[]) => void;
}

export function AppSelect({ apps, setApps }: AppSelectProps) {
	const { items, isLoading } = useSqlAutocomplete("app");

	const appItems = React.useMemo(() => {
		return items.map((app) => ({
			value: app.name,
			count: app.count,
			label: app.name,
		}));
	}, [items]);

	const renderTech = (option: (typeof appItems)[number]) => (
		<div className="flex items-center gap-2">
			<span className="text-xl">
				<img
					src={`http://localhost:11435/app-icon?name=${option.value}`}
					className="w-6 h-6"
					alt={option.value}
					loading="lazy"
					decoding="async"
				/>
			</span>
			<div className="flex flex-col">
				<span>{option.label}</span>
			</div>
		</div>
	);

	const renderSelected = (value: string[]) => (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger className="h-full">
					<div className="flex gap-1 h-full">
						{value.map((id) => {
							const tech = appItems.find((t) => t.value === id)!;

							if (!tech) return;
							return (
								<span key={id}>
									{
										<img
											src={`http://localhost:11435/app-icon?name=${tech.label}`}
											className="w-6 h-6"
											alt={tech.label}
											loading="lazy"
											decoding="async"
										/>
									}
								</span>
							);
						})}
					</div>
				</TooltipTrigger>
				<TooltipContent>
					{value.map((id) => {
						const tech = appItems.find((t) => t.value === id)!;
						if (!tech) return;
						return <div key={id}>{tech.label}</div>;
					})}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);

	return (
		<MultiSelectCombobox
			label="Applications"
			options={appItems}
			value={apps}
			onChange={setApps}
			renderItem={renderTech}
			renderSelectedItem={renderSelected}
			isLoading={isLoading}
		/>
	);
}
