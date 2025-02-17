"use client";

import * as React from "react";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSuggestions } from "@/lib/hooks/use-suggestion";
import { useDebounce } from "@/lib/hooks/use-debounce";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import { MultiSelectCombobox } from "./ui/multi-select-combobox";
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { DatePickerWithRange } from "./date-range-picker";
import { queryParser, QueryParser, querySerializer } from "@/lib/utils";
import { CustomDialogContent } from "./custom-dialog-content";
import { ArrowRight, XIcon } from "lucide-react";
import { useQueryStates } from "nuqs";

export function NewSearchCommand() {
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

export function SearchCommand() {
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const [search, setSearch] = useState("");
	const deferedValue = useDebounce(search, 400);
	const { suggestions, isLoading, error } = useSuggestions(deferedValue);
	const router = useRouter();
	//	const { search: searchFunc, isLoading, error } = useAppNameSuggestion();
	//	const [suggestions, setSuggestions] = useState<string[]>([]);

	React.useEffect(() => {
		if (open) {
			setTimeout(() => {
				inputRef.current?.focus();
			}, 0);
		}
	}, [open]);

	React.useEffect(() => {
		const signal = new AbortController();
		const commandOpen = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", commandOpen, {
			signal: signal.signal,
		});

		return () => signal.abort();
	}, []);

	const searchWord: React.KeyboardEventHandler<HTMLInputElement> = useCallback(
		(e) => {
			if (!(e.key === "Enter")) {
				return;
			}

			if (!(search.length >= 3)) {
				return;
			}

			setOpen(false);
			const searchParams = new URLSearchParams();
			searchParams.set("query", search);

			router.push(`/search?${searchParams.toString()}`);
		},
		[search],
	);

	React.useEffect(() => {
		if (open) return;

		setSearch("");
	}, [open]);

	//React.useEffect(() => {
	//	const fetchAppNames = async () => {
	//		if (!(deferedValue.length >= 3)) {
	//			return;
	//		}
	//
	//		const apps = await searchFunc(deferedValue);
	//
	//		const uniqueApps = new Set(apps.map((value) => value.app_name));
	//
	//		const suggest = uniqueApps
	//			.values()
	//			.map((value) => `${deferedValue} from ${value}`);
	//
	//		setSuggestions(suggest.toArray());
	//	};
	//
	//	fetchAppNames();
	//}, [deferedValue]);

	return (
		<>
			<CommandDialog open={open} onOpenChange={setOpen}>
				<CommandInput
					placeholder={isLoading ? "Searching..." : "Search..."}
					value={search}
					onValueChange={setSearch}
					onKeyDown={searchWord}
					ref={inputRef}
				/>
				<CommandList>
					{
						//<div>
						//	<AppSelect />
						//</div>
					}
					<CommandEmpty>
						{isLoading
							? "Generating suggestions..."
							: error
								? "Unable to generate suggestions"
								: search.length < 3
									? "Type at least 3 characters to search"
									: "No suggestions found"}{" "}
					</CommandEmpty>
					{!isLoading && suggestions.length > 0 && (
						<CommandGroup heading="Suggestions">
							{suggestions.map((sug, i) => (
								<CommandItem
									key={i}
									onSelect={(value) => {
										setOpen(false);
										const searchParams = new URLSearchParams();
										searchParams.set("query", value);
										router.push(`/search?${searchParams.toString()}`);
									}}
								>
									{sug}
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
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
