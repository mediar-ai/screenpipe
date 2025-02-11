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

export function SearchCommand() {
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const [search, setSearch] = useState("");
	const deferedValue = useDebounce(search, 400);
	const { suggestions, isLoading, error } = useSuggestions(deferedValue);
	const router = useRouter();

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
					<CommandEmpty>
						{isLoading
							? "Generating suggestions..."
							: error
								? "Unable to generate suggestions"
								: search.length < 3
									? "Type at least 3 characters to search"
									: "No suggestions found"}
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
