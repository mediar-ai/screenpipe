import { usePipeSettings, useSettings } from "@/lib/hooks/use-pipe-settings";
import { useMemo, useState, useEffect } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "./ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
	Check,
	Plus,
	Copy,
	Edit2,
	Star,
	Trash2,
	Settings,
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

interface AIPresetDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (preset: Partial<AIPreset>) => void;
	preset?: AIPreset;
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

interface AIPresetsDialogProps {
	children?: React.ReactNode;
	recommendedPresets?: RecommendedPreset[];
}

export const AIPresetsDialog = ({ children, recommendedPresets }: AIPresetsDialogProps) => {
	const { settings: pipeSettings, updateSettings: updatePipeSettings } =
		usePipeSettings("search");
	const { settings, updateSettings } = useSettings();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [presetDialogOpen, setPresetDialogOpen] = useState(false);
	const [selectedPresetToEdit, setSelectedPresetToEdit] = useState<
		AIPreset | undefined
	>();

	const aiPresets = (settings?.aiPresets || []) as AIPreset[];

	const selectedPreset = useMemo(() => {
		const preset = settings?.aiPresets?.find(
			(preset) => preset.id == pipeSettings?.aiPresetId,
		);

		return preset;
	}, [settings?.aiPresets, pipeSettings?.aiPresetId]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Check for Cmd/Ctrl + /
			if ((e.metaKey || e.ctrlKey) && e.key === "/") {
				e.preventDefault();
				if (!aiPresets.length) return;

				const currentIndex = selectedPreset
					? aiPresets.findIndex((p) => p.id === selectedPreset.id)
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

		setPresetDialogOpen(false);
		setSelectedPresetToEdit(undefined);
	};

	const handleDuplicatePreset = (preset: AIPreset) => {
		setSelectedPresetToEdit({
			...preset,
			id: `${preset.id}-copy`,
			defaultPreset: false,
		});
		setPresetDialogOpen(true);
	};

	const handleEditPreset = (preset: AIPreset) => {
		setSelectedPresetToEdit(preset);
		setPresetDialogOpen(true);
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

	const renderTrigger = () => {
		const content = children || (
			<Button 
			variant="outline"		
			className="flex w-full items-center">
				<Settings className="mr-2 h-4 w-4" />
				Manage AI Presets
			</Button>
		);

		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild
								onClick={() => setDialogOpen(true)}
						>
								{content}
						</DialogTrigger>
					</TooltipTrigger>
					<TooltipContent className="space-y-1 text-justify">
						<p className="flex items-center gap-2">
							<span>Press</span>
							<kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">⌘/</kbd>
							<span>to cycle presets</span>
						</p>
						{selectedPreset && (
							<div className="mt-2 pt-2 border-t">
								<div className="font-medium truncate max-w-[200px]">{selectedPreset.id}</div>
								<div className="text-xs text-muted-foreground space-y-0.5">
									<div className="flex items-center gap-2">
										<span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
											{selectedPreset.provider}
										</span>
										<span className="truncate max-w-[120px]">
											{selectedPreset.model}
										</span>
									</div>
									<div className="whitespace-nowrap">
										Context: {(selectedPreset.maxContextChars / 1000).toFixed(0)}k chars
									</div>
									{selectedPreset.defaultPreset && (
										<div className="text-primary">Default Preset</div>
									)}
								</div>
							</div>
						)}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	};

	return (
		<>
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
					{renderTrigger()}
				<DialogContent className="w-[95vw] sm:w-[640px] md:w-[768px] lg:w-[1024px] xl:w-[1280px] max-w-[95vw]">
					<DialogHeader>
						<DialogTitle>AI Presets</DialogTitle>
						<DialogDescription>
							Manage your AI presets. You can create, edit, duplicate, and delete presets.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Command>
							<CommandInput placeholder="search presets..." />
							<CommandEmpty>no presets found.</CommandEmpty>
							{recommendedPresets && recommendedPresets.length > 0 && (
								<CommandGroup heading="Recommended Presets">
									{recommendedPresets.map((preset) => (
										<CommandItem
											key={preset.id}
											value={preset.id}
											className="flex py-3"
										>
											<div className="flex w-full items-center justify-between gap-4 overflow-hidden">
												<div className="flex items-center gap-3 min-w-0">
													<Check
														className={cn(
															"h-4 w-4 shrink-0",
															selectedPreset?.id === preset.id
																? "opacity-100"
																: "opacity-0",
														)}
													/>
													<span className="font-medium truncate max-w-[180px]">
														{preset.id}
													</span>
													<span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-xs font-medium shrink-0">
														recommended
													</span>
												</div>
												<div className="flex items-center justify-end gap-4 text-xs text-muted-foreground shrink-0">
													<div className="flex items-center gap-3">
														<span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
															{preset.provider}
														</span>
														<span className="truncate max-w-[180px]">
															{preset.model}
														</span>
													</div>
													<span className="whitespace-nowrap">
														{(preset.maxContextChars / 1000).toFixed(0)}k
													</span>
													<div className="flex items-center gap-2">
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 shrink-0"
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
																setPresetDialogOpen(true);
															}}
														>
															<Copy className="h-4 w-4" />
														</Button>
													</div>
												</div>
											</div>
										</CommandItem>
									))}
								</CommandGroup>
							)}
							<CommandGroup heading="Your Presets">
								{aiPresets.map((preset) => (
									<CommandItem
										key={preset.id}
										value={preset.id}
										onSelect={(currentValue) => {
											updatePipeSettings({
												aiPresetId:
													currentValue === selectedPreset?.id ? "" : currentValue,
											});
										}}
										className="flex py-3"
									>
										<div className="flex w-full items-center justify-between gap-4 overflow-hidden">
											<div className="flex items-center gap-3 min-w-0">
												<Check
													className={cn(
														"h-4 w-4 shrink-0",
														selectedPreset?.id === preset.id
															? "opacity-100"
															: "opacity-0",
													)}
												/>
												<span className="font-medium truncate max-w-[180px]">
													{preset.id}
												</span>
												{preset.defaultPreset && (
													<span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium shrink-0">
														default
													</span>
												)}
											</div>
											<div className="flex items-center justify-end gap-4 text-xs text-muted-foreground shrink-0">
												<div className="flex items-center gap-3">
													<span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
														{preset.provider}
													</span>
													<span className="truncate max-w-[180px]">
														{preset.model}
													</span>
												</div>
												<span className="whitespace-nowrap">
													{(preset.maxContextChars / 1000).toFixed(0)}k
												</span>
													<div className="flex items-center gap-2">
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 shrink-0"
															onClick={(e) => {
																e.stopPropagation();
																handleEditPreset(preset);
															}}
														>
															<Edit2 className="h-4 w-4" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 shrink-0"
															onClick={(e) => {
																e.stopPropagation();
																handleDuplicatePreset(preset);
															}}
														>
															<Copy className="h-4 w-4" />
														</Button>
														{!preset.defaultPreset && (
															<>
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-7 w-7 shrink-0"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleSetDefaultPreset(preset);
																	}}
																>
																	<Star className="h-4 w-4" />
																</Button>
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-7 w-7 shrink-0"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleRemovePreset(preset);
																	}}
																>
																	<Trash2 className="h-4 w-4" />
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
											setSelectedPresetToEdit(undefined);
											setPresetDialogOpen(true);
										}}
									>
										<Plus className="mr-2 h-4 w-4" />
										create new preset
									</CommandItem>
							</CommandGroup>
						</Command>
					</div>
				</DialogContent>
			</Dialog>
			<AIPresetDialog
				open={presetDialogOpen}
				onOpenChange={setPresetDialogOpen}
				onSave={handleSavePreset}
				preset={selectedPresetToEdit}
			/>
		</>
	);
}; 