import { usePipeSettings, useSettings } from "@/lib/hooks/use-pipe-settings";
import { useMemo, useState, useEffect } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
	Check,
	ChevronsUpDown,
	Plus,
	Copy,
	Edit2,
	Star,
	Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AIProviderConfig } from "./ai-provider-config";
import { toast } from "@/lib/use-toast";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

interface BaseAIPreset {
	id: string;
	maxContextChars: number;
	url: string;
	model: string;
	defaultPreset: boolean;
	prompt: string;
}

type AIPreset = BaseAIPreset &
	(
		| {
				provider: "openai";
				apiKey: string;
		  }
		| {
				provider: "native-ollama";
		  }
		| {
				provider: "screenpipe-cloud";
		  }
		| {
				provider: "custom";
				apiKey?: string;
		  }
	);

interface BaseRecommendedPreset {
	id: string;
	maxContextChars: number;
	model: string;
	prompt: string;
}

type RecommendedPreset = BaseRecommendedPreset &
	(
		| {
				provider: "openai";
		  }
		| {
				provider: "native-ollama";
		  }
		| {
				provider: "screenpipe-cloud";
		  }
	);

interface AIPresetDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (preset: Partial<AIPreset>) => void;
	preset?: AIPreset;
}

interface AIPresetsSelectorProps {
	recommendedPresets?: RecommendedPreset[];
	pipeName: string;
}

export const AIPresetDialog = ({
	open,
	onOpenChange,
	onSave,
	preset,
}: AIPresetDialogProps) => {
	const handleProviderSubmit = (providerData: any) => {
		const newPreset: Partial<AIPreset> = {
			...preset,
			provider: providerData.provider,
			url: providerData.baseUrl,
			model: providerData.modelName,
			id: providerData.id,
			maxContextChars: providerData.maxContextChars,
			prompt: providerData.prompt,
		};

		// Only add apiKey if provider is openai or custom
		if (
			providerData.provider === "openai" ||
			providerData.provider === "custom"
		) {
			(newPreset as any).apiKey = providerData.apiKey;
		}

		onSave(newPreset);
	};

	const defaultPreset = preset
		? {
				id: preset.id,
				provider: preset.provider,
				baseUrl: preset.url,
				modelName: preset.model,
				...("apiKey" in preset ? { apiKey: preset.apiKey } : {}),
			}
		: undefined;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-3/4 max-w-screen-2xl">
				<DialogHeader className="sr-only">
					<DialogTitle>
						{preset ? "Edit Preset" : "Create New Preset"}
					</DialogTitle>
					<DialogDescription>
						{preset
							? "Modify your AI preset settings here. Click save when you're done."
							: "Configure your AI preset settings here. Click continue when you're done."}
					</DialogDescription>
				</DialogHeader>
				<AIProviderConfig
					onSubmit={handleProviderSubmit}
					defaultPreset={defaultPreset}
				/>
			</DialogContent>
		</Dialog>
	);
};

export const AIPresetsSelector = ({ recommendedPresets, pipeName }: AIPresetsSelectorProps) => {
	const { settings: pipeSettings, updateSettings: updatePipeSettings } =
		usePipeSettings(pipeName);
	const { settings, updateSettings } = useSettings();
	const [open, setOpen] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedPresetToEdit, setSelectedPresetToEdit] = useState<
		AIPreset | undefined
	>();

	const aiPresets = (settings?.aiPresets || []) as AIPreset[];

	const selectedPreset = useMemo(() => {
		const preset = settings?.aiPresets?.find(
			(preset) => preset.id == pipeSettings?.aiPresetId,
		);

		return preset?.id;
	}, [settings?.aiPresets, pipeSettings?.aiPresetId]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Check for Cmd/Ctrl + /
			if ((e.metaKey || e.ctrlKey) && e.key === "/") {
				e.preventDefault();
				if (!aiPresets.length) return;

				const currentIndex = selectedPreset
					? aiPresets.findIndex((p) => p.id === selectedPreset)
					: -1;
				const nextIndex = (currentIndex + 1) % aiPresets.length;
				const nextPreset = aiPresets[nextIndex];

				updatePipeSettings({
					aiPresetId: nextPreset.id,
				});

				toast({
					title: "Preset changed",
					description: `Switched to ${nextPreset.id} (${nextPreset.model})`,
				});
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [aiPresets, selectedPreset, updatePipeSettings]);

	const handleSavePreset = (preset: Partial<AIPreset>) => {
		if (!preset.id) {
			toast({
				title: "please enter a name for this preset",
				description: "name is required",
				variant: "destructive",
			});
			return;
		}

		if (!settings?.aiPresets) {
			toast({
				title: "error",
				description: "settings not initialized",
				variant: "destructive",
			});
			return;
		}

		// If we're editing an existing preset
		if (selectedPresetToEdit) {
			// If this is a copy operation, treat it as a new preset
			if (
				preset.id !== selectedPresetToEdit.id ||
				preset.id.endsWith("-copy")
			) {
				// Check for duplicate ID
				const existingPreset = settings.aiPresets.find(
					(pre) => pre.id === preset.id,
				);

				if (existingPreset) {
					toast({
						title: "name already exists",
						description: "please choose a different name",
						variant: "destructive",
					});
					return;
				}

				// Add as new preset
				updateSettings({
					aiPresets: [
						...settings.aiPresets,
						{
							...preset,
							defaultPreset: false,
						} as AIPreset,
					],
				});

				toast({
					title: "preset copied",
					description: "new preset has been created from copy",
				});
			} else {
				// Normal edit operation
				const updatedPresets = settings.aiPresets.map((p) =>
					p.id === selectedPresetToEdit.id
						? ({ ...preset, defaultPreset: p.defaultPreset } as AIPreset)
						: p,
				);

				// If editing the default preset, update the global settings as well
				const isEditingDefaultPreset = selectedPresetToEdit.defaultPreset;
				if (isEditingDefaultPreset) {
					updateSettings({
						aiPresets: updatedPresets,
						aiModel: preset.model,
						aiProviderType: preset.provider,
						customPrompt: preset.prompt,
						aiMaxContextChars: preset.maxContextChars,
						aiUrl: preset.url,
						...("apiKey" in preset && {
							openaiApiKey: preset.apiKey,
						}),
					});
				} else {
					updateSettings({
						aiPresets: updatedPresets,
					});
				}

				toast({
					title: "preset updated",
					description: "your changes have been saved",
				});
			}
		} else {
			// Check for duplicate ID only when creating new preset
			const existingPreset = settings.aiPresets.find(
				(pre) => pre.id === preset.id,
			);

			if (existingPreset) {
				toast({
					title: "name already exists",
					description: "please choose a different name",
					variant: "destructive",
				});
				return;
			}

			// Handle first preset creation
			if (settings.aiPresets.length === 0) {
				const newPreset = {
					...preset,
					defaultPreset: true,
				} as AIPreset;

				updateSettings({
					aiPresets: [newPreset],
					aiModel: newPreset.model,
					aiProviderType: newPreset.provider,
					customPrompt: newPreset.prompt,
					aiMaxContextChars: newPreset.maxContextChars,
					aiUrl: newPreset.url,
					...("apiKey" in newPreset && {
						openaiApiKey: newPreset.apiKey,
					}),
				});
			} else {
				// Adding a new preset
				updateSettings({
					aiPresets: [
						...settings.aiPresets,
						{
							...preset,
							defaultPreset: false,
						} as AIPreset,
					],
				});
			}

			toast({
				title: "preset created",
				description: "new preset has been added",
			});
		}

		setDialogOpen(false);
		setSelectedPresetToEdit(undefined);
	};

	const handleDuplicatePreset = (preset: AIPreset) => {
		setSelectedPresetToEdit({
			...preset,
			id: `${preset.id}-copy`,
			defaultPreset: false,
		});
		setDialogOpen(true);
	};

	const handleEditPreset = (preset: AIPreset) => {
		setSelectedPresetToEdit(preset);
		setDialogOpen(true);
	};

	const handleSetDefaultPreset = (preset: AIPreset) => {
		if (!settings?.aiPresets) return;
		if (preset.defaultPreset) return;

		const updatedPresets = settings.aiPresets.map((p) => ({
			...p,
			defaultPreset: p.id === preset.id,
		}));

		updateSettings({
			aiPresets: updatedPresets,
			aiModel: preset.model,
			aiProviderType: preset.provider,
			customPrompt: preset.prompt,
			aiMaxContextChars: preset.maxContextChars,
			aiUrl: preset.url,
			...("apiKey" in preset && {
				openaiApiKey: preset.apiKey,
			}),
		});

		toast({
			title: "default preset updated",
			description: `${preset.id} is now the default preset`,
		});
	};

	const handleRemovePreset = (preset: AIPreset) => {
		if (!settings?.aiPresets) return;
		if (preset.defaultPreset) {
			toast({
				title: "cannot delete default preset",
				description: "please set another preset as default first",
				variant: "destructive",
			});
			return;
		}

		const updatedPresets = settings.aiPresets.filter((p) => p.id !== preset.id);
		updateSettings({
			aiPresets: updatedPresets,
		});

		if (pipeSettings?.aiPresetId === preset.id) {
			updatePipeSettings({
				aiPresetId: "",
			});
		}

		toast({
			title: "preset removed",
			description: `${preset.id} has been removed`,
		});
	};

	return (
		<>
			<div className="flex w-full items-center gap-2">
				<Popover open={open} onOpenChange={setOpen}>
					<TooltipProvider>
						<Tooltip>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									role="combobox"
									aria-expanded={open}
									className="w-full justify-between"
								>
									{selectedPreset ? (
										<div className="flex w-full items-center justify-between gap-2 overflow-hidden">
											<span className="font-medium min-w-[80px] max-w-[30%] truncate text-left">
												{aiPresets.find((preset) => preset.id === selectedPreset)?.id}
											</span>
											<div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden">
												<span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
													{aiPresets.find((preset) => preset.id === selectedPreset)?.provider}
												</span>
												<span className="hidden sm:block truncate max-w-[30%]">
													{aiPresets.find((preset) => preset.id === selectedPreset)?.model}
												</span>
												<span className="whitespace-nowrap">
													{((aiPresets.find((preset) => preset.id === selectedPreset)?.maxContextChars || 0) / 1000).toFixed(0)}k
												</span>
											</div>
										</div>
									) : (
										"select ai preset..."
									)}
									<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
								</Button>
							</PopoverTrigger>
							<TooltipContent>
								<p className="flex items-center gap-2">
									<span>Press</span>
									<kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">⌘/</kbd>
									<span>to cycle presets</span>
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					<PopoverContent className="w-[--radix-popover-trigger-width] p-0">
						<Command className="max-h-[300px]">
							<CommandInput placeholder="search presets..." />
							<CommandEmpty>no presets found.</CommandEmpty>
							{recommendedPresets && recommendedPresets.length > 0 && (
								<CommandGroup heading="Recommended Presets">
									{recommendedPresets.map((preset) => (
										<CommandItem
											key={preset.id}
											value={preset.id}
											className="flex py-2"
										>
											<div className="flex w-full items-center justify-between gap-2 overflow-hidden">
												<div className="flex items-center gap-2 min-w-0 flex-shrink">
													<Check
														className={cn(
															"h-4 w-4 shrink-0",
															selectedPreset === preset.id
																? "opacity-100"
																: "opacity-0",
														)}
													/>
													<span className="font-medium truncate max-w-[30%]">
														{preset.id}
													</span>
													<span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-xs font-medium shrink-0">
														recommended
													</span>
												</div>
												<div className="flex items-center justify-end gap-2 text-xs text-muted-foreground shrink-0">
													<div className="flex items-center gap-2">
														<span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
															{preset.provider}
														</span>
														<span className="hidden sm:block truncate max-w-[30%]">
															{preset.model}
														</span>
													</div>
													<span className="whitespace-nowrap">
														{(preset.maxContextChars / 1000).toFixed(0)}k
													</span>
													<div className="flex items-center gap-1">
														<Button
															variant="ghost"
															size="icon"
															className="h-6 w-6 shrink-0"
															onClick={(e) => {
																e.stopPropagation();
																// Create a full preset from the recommended preset with -copy suffix
																const fullPreset = {
																	...preset,
																	id: `${preset.id}-copy`,
																	url: preset.provider === "openai" 
																		? "https://api.openai.com/v1" 
																		: preset.provider === "screenpipe-cloud"
																		? "https://api.screenpipe.co/v1"
																		: preset.provider === "native-ollama"
																		? "http://localhost:11434/v1"
																		: "",
																	defaultPreset: false,
																} as AIPreset;
																setSelectedPresetToEdit(fullPreset);
																setDialogOpen(true);
															}}
														>
															<Copy className="h-3 w-3" />
														</Button>
													</div>
												</div>
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							)}
							<CommandGroup>
								{aiPresets.map((preset) => (
									<CommandItem
										key={preset.id}
										value={preset.id}
										onSelect={(currentValue) => {
											updatePipeSettings({
												aiPresetId:
													currentValue === selectedPreset ? "" : currentValue,
											});
											setOpen(false);
										}}
										className="flex py-2"
									>
										<div className="flex w-full items-center justify-between gap-2 overflow-hidden">
											<div className="flex items-center gap-2 min-w-0">
												<Check
													className={cn(
														"h-4 w-4 shrink-0",
														selectedPreset === preset.id
															? "opacity-100"
															: "opacity-0",
													)}
												/>
												<span className="font-medium truncate max-w-[120px]">
													{preset.id}
												</span>
												{preset.defaultPreset && (
													<span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0">
														default
													</span>
												)}
											</div>
											<div className="flex items-center justify-end gap-2 text-xs text-muted-foreground shrink-0">
												<div className="flex items-center gap-2">
													<span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
														{preset.provider}
													</span>
													<span className="truncate max-w-[120px]">
														{preset.model}
													</span>
												</div>
												<span className="whitespace-nowrap">
													{(preset.maxContextChars / 1000).toFixed(0)}k
												</span>
												<div className="flex items-center gap-1">
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6 shrink-0"
														onClick={(e) => {
															e.stopPropagation();
															handleEditPreset(preset);
														}}
													>
														<Edit2 className="h-3 w-3" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6 shrink-0"
														onClick={(e) => {
															e.stopPropagation();
															handleDuplicatePreset(preset);
														}}
													>
														<Copy className="h-3 w-3" />
													</Button>
													{!preset.defaultPreset && (
														<>
															<Button
																variant="ghost"
																size="icon"
																className="h-6 w-6 shrink-0"
																onClick={(e) => {
																	e.stopPropagation();
																	handleSetDefaultPreset(preset);
																}}
															>
																<Star className="h-3 w-3" />
															</Button>
															<Button
																variant="ghost"
																size="icon"
																className="h-6 w-6 shrink-0"
																onClick={(e) => {
																	e.stopPropagation();
																	handleRemovePreset(preset);
																}}
															>
																<Trash2 className="h-3 w-3" />
															</Button>
														</>
													)}
												</div>
											</div>
										</div>
									</CommandItem>
								))}
							</CommandGroup>
							<CommandGroup>
								<CommandItem
									onSelect={() => {
										setOpen(false);
										setSelectedPresetToEdit(undefined);
										setDialogOpen(true);
									}}
								>
									<Plus className="mr-2 h-4 w-4" />
									create new preset
								</CommandItem>
							</CommandGroup>
						</Command>
					</PopoverContent>
				</Popover>
			</div>
			<AIPresetDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSave={handleSavePreset}
				preset={selectedPresetToEdit}
			/>
		</>
	);
};
