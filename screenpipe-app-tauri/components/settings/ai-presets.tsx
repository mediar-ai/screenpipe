import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import {
	AIPreset,
	DEFAULT_PROMPT,
	useSettings,
} from "@/lib/hooks/use-settings";
import { AIModel, AIProviderCard, OllamaModel } from "./ai-section";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
	ArrowLeft,
	ChevronsUpDown,
	Eye,
	EyeOff,
	HelpCircle,
	Loader2,
	Plus,
	RefreshCw,
	Settings2,
	Trash2,
	XIcon,
} from "lucide-react";
import { Textarea } from "../ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import { Slider } from "../ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "../ui/command";
import { Badge } from "../ui/badge";
import { toast } from "../ui/use-toast";
import { Card } from "../ui/card";
import { AIProviderType } from "@screenpipe/browser";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const AISection = ({
	preset,
	setDialog,
	isDuplicating,
}: {
	preset?: AIPreset;
	setDialog: (value: boolean) => void;
	isDuplicating?: boolean;
}) => {
	const { settings, updateSettings } = useSettings();
	const [settingsPreset, setSettingsPreset] = useState<
		Partial<AIPreset> | undefined
	>(preset);
	const [isLoading, setIsLoading] = useState(false);
	const [showApiKey, setShowApiKey] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);

	const validateName = (name: string) => {
		if (!name) {
			setNameError("name is required");
			return false;
		}
		if (name.trim().toLowerCase().endsWith("copy")) {
			setNameError("name cannot end with 'copy'");
			return false;
		}
		if (settings.aiPresets.find(
			(p) => p.id.toLowerCase() === name.toLowerCase() && p.id !== preset?.id
		)) {
			setNameError("name already exists");
			return false;
		}
		setNameError(null);
		return true;
	};

	const updateStoreSettings = async () => {
		setIsLoading(true);
		try {
			if (!settingsPreset?.id) {
				toast({
					title: "please enter a name",
					description: "name is required",
					variant: "destructive",
				});
				return;
			}

			if (!validateName(settingsPreset.id)) {
				return;
			}

			// If this is the first preset, make it default
			if (!settings.aiPresets.length) {
				const defaultPreset = {
					...settingsPreset,
					prompt: settingsPreset?.prompt || DEFAULT_PROMPT,
					maxContextChars: settingsPreset?.maxContextChars || 512000,
					defaultPreset: true,
				} as AIPreset;

				await updateSettings({
					aiModel: defaultPreset?.model,
					aiProviderType: defaultPreset?.provider,
					customPrompt: defaultPreset?.prompt,
					aiMaxContextChars: defaultPreset?.maxContextChars,
					aiUrl: defaultPreset?.url,
					...("apiKey" in defaultPreset && {
						openaiApiKey: defaultPreset.apiKey,
					}),
					aiPresets: [defaultPreset],
				});

				toast({
					title: "preset created",
					description: "default preset has been created",
				});

				setDialog(false);
				return;
			}

			// Handle update case
			if (preset && !isDuplicating) {
				const updatedPresets = settings.aiPresets.map((p) => {
					if (p.id === preset.id) {
						const updatedPreset = {
							...settingsPreset,
							prompt: settingsPreset?.prompt || DEFAULT_PROMPT,
							maxContextChars: settingsPreset?.maxContextChars || 512000,
							defaultPreset: p.defaultPreset,
						} as AIPreset;

						// If this is the default preset, update global settings too
						if (p.defaultPreset) {
							updateSettings({
								aiModel: updatedPreset.model,
								aiProviderType: updatedPreset.provider,
								customPrompt: updatedPreset.prompt,
								aiMaxContextChars: updatedPreset.maxContextChars,
								aiUrl: updatedPreset.url,
								...("apiKey" in updatedPreset && {
									openaiApiKey: updatedPreset.apiKey,
								}),
							});
						}

						return updatedPreset;
					}
					return p;
				});

				await updateSettings({
					aiPresets: updatedPresets,
				});

				toast({
					title: "preset updated",
					description: "changes have been saved",
				});
			} else {
				// Handle create case (new preset or duplicate)
				const newPreset = {
					...settingsPreset,
					prompt: settingsPreset?.prompt || DEFAULT_PROMPT,
					maxContextChars: settingsPreset?.maxContextChars || 512000,
					defaultPreset: false,
				} as AIPreset;

				await updateSettings({
					aiPresets: [...settings.aiPresets, newPreset],
				});

				toast({
					title: isDuplicating ? "preset duplicated" : "preset created",
					description: isDuplicating ? "duplicate has been saved" : "new preset has been added",
				});
			}

			setDialog(false);
		} catch (error) {
			toast({
				title: "error saving preset",
				description: "something went wrong while saving the preset",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const updateSettingsPreset = (presetsObject: Partial<AIPreset>) => {
		setSettingsPreset({ ...settingsPreset, ...presetsObject });
	};

	const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		updateSettingsPreset({
			apiKey: value,
		});
	};

	const handleMaxContextCharsChange = (value: number[]) => {
		updateSettingsPreset({
			maxContextChars: value[0],
		});
	};

	const handleCustomPromptChange = (
		e: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		updateSettingsPreset({
			prompt: e.target.value ?? DEFAULT_PROMPT,
		});
	};

	const handleResetCustomPrompt = () => {
		updateSettingsPreset({
			prompt: DEFAULT_PROMPT,
		});
	};

	const handleAiProviderChange = (newValue: AIPreset["provider"]) => {
		let newUrl = "";
		let newModel = settingsPreset?.model;

		switch (newValue) {
			case "openai":
				newUrl = "https://api.openai.com/v1";
				break;
			case "native-ollama":
				newUrl = "http://localhost:11434/v1";
				break;
			case "screenpipe-cloud":
				newUrl = "https://ai-proxy.i-f9f.workers.dev/v1";
				break;
			case "custom":
				newUrl = settingsPreset?.url || "";
				break;
		}

		updateSettingsPreset({
			provider: newValue,
			url: newUrl,
			model: newModel,
		});
	};

	const isApiKeyRequired =
		settingsPreset?.url !== "https://ai-proxy.i-f9f.workers.dev/v1" &&
		settingsPreset?.url !== "http://localhost:11434/v1" &&
		settingsPreset?.url !== "embedded";

	const [models, setModels] = useState<AIModel[]>([]);
	const [isLoadingModels, setIsLoadingModels] = useState(false);

	const fetchModels = async () => {
		setIsLoadingModels(true);
		console.log(settingsPreset);
		try {
			switch (settingsPreset?.provider) {
				case "screenpipe-cloud":
					const response = await fetch(
						"https://ai-proxy.i-f9f.workers.dev/v1/models",
						{
							headers: {
								Authorization: `Bearer ${settings.user?.id || ""}`,
							},
						},
					);
					if (!response.ok) throw new Error("Failed to fetch models");
					const data = await response.json();
					setModels(data.models);
					break;

				case "native-ollama":
					const ollamaResponse = await fetch("http://localhost:11434/api/tags");
					if (!ollamaResponse.ok)
						throw new Error("Failed to fetch Ollama models");
					const ollamaData = (await ollamaResponse.json()) as {
						models: OllamaModel[];
					};
					setModels(
						(ollamaData.models || []).map((model) => ({
							id: model.name,
							name: model.name,
							provider: "ollama",
						})),
					);
					break;

				case "openai":
					setModels([
						{ id: "gpt-4", name: "gpt-4", provider: "openai" },
						{
							id: "gpt-3.5-turbo",
							name: "gpt-3.5-turbo",
							provider: "openai",
						},
					]);
					break;

				case "custom":
					try {
						const customResponse = await fetch(
							`${settingsPreset?.url}/models`,
							{
								headers: settingsPreset.apiKey
									? { Authorization: `Bearer ${settingsPreset?.apiKey}` }
									: {},
							},
						);
						if (!customResponse.ok)
							throw new Error("Failed to fetch custom models");
						const customData = await customResponse.json();
						console.log(customData);
						setModels(
							(customData.data || []).map((model: { id: string }) => ({
								id: model.id,
								name: model.id,
								provider: "custom",
							})),
						);
					} catch (error) {
						console.error(
							"Failed to fetch custom models, allowing manual input:",
							error,
						);
						setModels([]);
					}
					break;

				default:
					setModels([]);
			}
		} catch (error) {
			console.error(
				`Failed to fetch models for ${settingsPreset?.provider}:`,
				error,
			);
			setModels([]);
		} finally {
			setIsLoadingModels(false);
		}
	};

	const apiKey = useMemo(() => {
		if (settingsPreset && "apiKey" in settingsPreset) {
			return settingsPreset?.apiKey;
		}
		return "";
	}, [settingsPreset]);

	useEffect(() => {
		console.log("hello");
		fetchModels();
	}, [settingsPreset?.provider, apiKey, settingsPreset?.url]);

	return (
		<div className="w-full space-y-6 py-4">
			<div className="flex flex-col gap-2">
				<Button
					className="w-max flex gap-2"
					variant={"link"}
					onClick={() => setDialog(false)}
				>
					<ArrowLeft className="w-4 h-4" /> back
				</Button>
				<h1 className="text-2xl font-bold">
					{preset ? "update preset" : "create preset"}
				</h1>
			</div>
			<div className="w-full">
				<div className="flex flex-col gap-2">
					<Label htmlFor="aiUrl" className="min-w-[80px]">
						ai provider
					</Label>
				</div>
				<div className="grid grid-cols-2 gap-4 mb-4 mt-4">
					<AIProviderCard
						type="openai"
						title="openai"
						description="use your own openai api key for gpt-4 and other models"
						imageSrc="/images/openai.png"
						selected={settingsPreset?.provider === "openai"}
						onClick={() => handleAiProviderChange("openai")}
					/>

					<AIProviderCard
						type="screenpipe-cloud"
						title="screenpipe cloud"
						description="use openai, anthropic and google models without worrying about api keys or usage"
						imageSrc="/images/screenpipe.png"
						selected={settingsPreset?.provider === "screenpipe-cloud"}
						onClick={() => handleAiProviderChange("screenpipe-cloud")}
						disabled={!settings.user}
						warningText={
							!settings.user
								? "login required"
								: !settings.user?.credits?.amount
									? "requires credits"
									: undefined
						}
					/>

					<AIProviderCard
						type="native-ollama"
						title="ollama"
						description="run ai models locally using your existing ollama installation"
						imageSrc="/images/ollama.png"
						selected={settingsPreset?.provider === "native-ollama"}
						onClick={() => handleAiProviderChange("native-ollama")}
					/>

					<AIProviderCard
						type="custom"
						title="custom"
						description="connect to your own ai provider or self-hosted models"
						imageSrc="/images/custom.png"
						selected={settingsPreset?.provider === "custom"}
						onClick={() => handleAiProviderChange("custom")}
					/>
				</div>
			</div>
			<div className="w-full">
				<div className="flex flex-col gap-4 mb-4">
					<Label htmlFor="preset_id" className="flex items-center gap-2">
						name
						{nameError && (
							<span className="text-xs text-destructive font-normal">
								{nameError}
							</span>
						)}
					</Label>
					<Input
						id="preset_id"
						value={settingsPreset?.id}
						onChange={(e) => {
							const namePreset = e.target.value;
							validateName(namePreset);
							updateSettingsPreset({ id: namePreset });
						}}
						className={cn(
							"flex-grow",
							nameError && "border-destructive focus-visible:ring-destructive"
						)}
						placeholder="enter name"
						autoCorrect="off"
						autoCapitalize="off"
						autoComplete="off"
						type="text"
						disabled={!!preset && !isDuplicating && preset.id !== undefined}
					/>
				</div>
			</div>

			{settingsPreset?.provider === "custom" && (
				<div className="w-full">
					<div className="flex flex-col gap-4 mb-4">
						<Label htmlFor="customAiUrl">custom url</Label>
						<Input
							id="customAiUrl"
							value={settingsPreset?.url}
							onChange={(e) => {
								const newUrl = e.target.value;
								updateSettingsPreset({ url: newUrl });
							}}
							className="flex-grow"
							placeholder="enter custom ai url"
							autoCorrect="off"
							autoCapitalize="off"
							autoComplete="off"
							type="text"
						/>
					</div>
				</div>
			)}
			{isApiKeyRequired &&
				(settingsPreset?.provider === "openai" ||
					settingsPreset?.provider === "custom") && (
					<div className="w-full">
						<div className="flex flex-col gap-4 mb-4 w-full">
							<Label htmlFor="aiApiKey">API Key</Label>
							<div className="flex-grow relative">
								<Input
									id="aiApiKey"
									type={showApiKey ? "text" : "password"}
									value={settingsPreset?.apiKey}
									onChange={handleApiKeyChange}
									className="pr-10"
									placeholder="enter your ai api key"
									autoCorrect="off"
									autoCapitalize="off"
									autoComplete="off"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="absolute right-0 top-0 h-full"
									onClick={() => setShowApiKey(!showApiKey)}
								>
									{showApiKey ? (
										<EyeOff className="h-4 w-4" />
									) : (
										<Eye className="h-4 w-4" />
									)}
								</Button>
							</div>
						</div>
					</div>
				)}

			<div className="w-full">
				<div className="flex flex-col gap-4 mb-4 w-full">
					<Label htmlFor="aiModel">ai model</Label>
					<Popover modal={true}>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								role="combobox"
								className="w-full justify-between"
							>
								{settingsPreset?.model || "select model..."}
								<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-full p-0">
							<Command>
								<CommandInput placeholder="select or type model name" />
								<CommandList>
									<CommandEmpty>
										press enter to use &quot;{settingsPreset?.model}&quot;
									</CommandEmpty>
									<CommandGroup heading="Suggestions">
										{isLoadingModels ? (
											<CommandItem value="loading" disabled>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												loading models...
											</CommandItem>
										) : (
											models.map((model) => (
												<CommandItem
													key={model.id}
													value={model.id}
													onSelect={() => {
														updateSettingsPreset({ model: model.id });
													}}
												>
													{model.name}
													<Badge variant="outline" className="ml-2">
														{model.provider}
													</Badge>
												</CommandItem>
											))
										)}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>
			</div>
			<div className="w-full">
				<div className="flex flex-col gap-4 mb-4 w-full">
					<Label htmlFor="customPrompt">prompt</Label>
					<div className="flex-grow relative">
						<Textarea
							id="customPrompt"
							value={settingsPreset?.prompt || DEFAULT_PROMPT}
							onChange={handleCustomPromptChange}
							className="min-h-[100px]"
							placeholder="enter your custom prompt here"
						/>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="absolute right-2 top-2"
							onClick={handleResetCustomPrompt}
						>
							<RefreshCw className="h-4 w-4 mr-2" />
							reset
						</Button>
					</div>
				</div>
			</div>

			<div className="w-full">
				<div className="flex flex-col gap-4 mb-4 w-full">
					<Label htmlFor="aiMaxContextChars" className="flex items-center">
						max context{" "}
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<HelpCircle className="ml-2 h-4 w-4 cursor-default" />
								</TooltipTrigger>
								<TooltipContent side="left">
									<p>
										maximum number of characters (think 4 characters per token)
										to send to the ai model. <br />
										usually, openai models support up to 200k tokens, which is
										roughly 1m characters. <br />
										we&apos;ll use this for UI purposes to show you how much you
										can send.
									</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</Label>
					<div className="flex-grow flex items-center">
						<Slider
							id="aiMaxContextChars"
							min={10000}
							max={1000000}
							step={10000}
							value={
								settingsPreset?.maxContextChars
									? [settingsPreset?.maxContextChars]
									: [512000]
							}
							onValueChange={handleMaxContextCharsChange}
							className="flex-grow"
						/>
						<span className="ml-2 min-w-[60px] text-right">
							{settingsPreset?.maxContextChars?.toLocaleString() ?? 512000}
						</span>
					</div>
				</div>
			</div>
			<div className="flex justify-end">
				<Button 
					onClick={() => updateStoreSettings()}
					disabled={isLoading}
				>
					{isLoading ? (
						<Loader2 className="w-4 h-4 animate-spin mr-2" />
					) : null}
					{preset ? "update preset" : "create preset"}
				</Button>
			</div>
		</div>
	);
};

const providerImageSrc: Record<AIPreset["provider"], string> = {
	openai: "/images/openai.png",
	"screenpipe-cloud": "/images/screenpipe.png",
	"native-ollama": "/images/ollama.png",
	custom: "/images/custom.png",
};

export const AIPresets = () => {
	const { settings, updateSettings } = useSettings();
	const [createPresetsDialog, setCreatePresentDialog] = useState(false);
	const [selectedPreset, setSelectedPreset] = useState<AIPreset | undefined>();
	const [isLoading, setIsLoading] = useState(false);
	const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
	const [presetToSetDefault, setPresetToSetDefault] = useState<string | null>(null);
	const [isDuplicating, setIsDuplicating] = useState(false);

	useEffect(() => {
		if (!createPresetsDialog) {
			setSelectedPreset(undefined);
			setIsDuplicating(false);
		}
	}, [createPresetsDialog]);

	if (createPresetsDialog)
		return (
			<AISection 
				setDialog={setCreatePresentDialog} 
				preset={selectedPreset} 
				isDuplicating={isDuplicating}
			/>
		);

	const removePreset = async (id: string) => {
		setIsLoading(true);
		try {
			const checkIfDefault = settings.aiPresets.find(
				(preset) => preset.id === id,
			)?.defaultPreset;

			if (checkIfDefault) {
				toast({
					title: "cannot delete default preset",
					description: "please set another preset as default first",
					variant: "destructive",
				});
				return;
			}

			const checkIfIDPresent = settings.aiPresets.find(
				(preset) => preset.id === id,
			);

			if (!checkIfIDPresent) {
				toast({
					title: "preset not found",
					description: "the preset you're trying to delete doesn't exist",
					variant: "destructive",
				});
				return;
			}

			const filteredPresets = settings.aiPresets.filter(
				(preset) => preset.id !== id,
			);

			await updateSettings({
				aiPresets: filteredPresets,
			});

			toast({
				title: "preset deleted",
				description: "the preset has been removed successfully",
			});
		} catch (error) {
			toast({
				title: "error deleting preset",
				description: "something went wrong while deleting the preset",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
			setPresetToDelete(null);
		}
	};

	const setDefaultPreset = async (id: string) => {
		setIsLoading(true);
		try {
			const selectedPreset = settings.aiPresets.find((p) => p.id === id);
			if (!selectedPreset) return;

			const updatedPresets = settings.aiPresets.map((preset) => ({
				...preset,
				defaultPreset: preset.id === id,
			}));

			const updateData: any = {
				aiPresets: updatedPresets,
				aiModel: selectedPreset.model,
				aiProviderType: selectedPreset.provider,
				customPrompt: selectedPreset.prompt,
				aiMaxContextChars: selectedPreset.maxContextChars,
				aiUrl: selectedPreset.url,
			};

			if ('apiKey' in selectedPreset) {
				updateData.openaiApiKey = selectedPreset.apiKey;
			}

			await updateSettings(updateData);

			toast({
				title: "default preset updated",
				description: "the preset has been set as default",
			});
		} catch (error) {
			toast({
				title: "error updating default preset",
				description: "something went wrong while updating the default preset",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
			setPresetToSetDefault(null);
		}
	};

	const duplicatePreset = async (id: string) => {
		const presetToDuplicate = settings.aiPresets.find((p) => p.id === id);
		if (!presetToDuplicate) return;

		const newPreset = {
			...presetToDuplicate,
			id: `${presetToDuplicate.id} copy`,
			defaultPreset: false,
		};

		setSelectedPreset(newPreset);
		setIsDuplicating(true);
		setCreatePresentDialog(true);
	};

	if (!settings.aiPresets?.length) {
		return (
			<div className="w-full h-[400px] flex flex-col items-center justify-center space-y-4">
				<Settings2 className="w-12 h-12 text-muted-foreground" />
				<h2 className="text-xl font-medium text-muted-foreground">no presets yet</h2>
				<p className="text-sm text-muted-foreground">create your first ai preset to get started</p>
				<Button onClick={() => setCreatePresentDialog(true)}>
					<Plus className="w-4 h-4 mr-2" />
					create preset
				</Button>
			</div>
		);
	}

	return (
		<div className="w-full space-y-6 py-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">ai settings</h1>
				<Button onClick={() => setCreatePresentDialog(true)}>
					<Plus className="w-4 h-4 mr-2" />
					create preset
				</Button>
			</div>
			<div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
				{settings.aiPresets.map((preset) => {
					const isDefault = preset.defaultPreset;
					return (
						<Card
							key={preset.id}
							className="p-4 relative group transition-all hover:shadow-md"
						>
							<div 
								className="flex justify-between items-start cursor-pointer"
								onClick={() => {
									setSelectedPreset(preset);
									setIsDuplicating(false);
									setCreatePresentDialog(true);
								}}
							>
								<div className="space-y-2">
									<div className="text-lg font-semibold text-foreground flex items-center gap-2">
										{preset.id}
										{isDefault && (
											<Badge variant="secondary" className="font-normal">
												default
											</Badge>
										)}
									</div>
									<div className="text-sm text-muted-foreground space-y-1">
										<div className="flex items-center gap-2">
											<span>model:</span>
											<span className="font-medium">{preset.model}</span>
										</div>
										<div className="flex items-center gap-2">
											<span>context:</span>
											<span className="font-medium">
												{preset.maxContextChars?.toLocaleString()}
											</span>
										</div>
									</div>
								</div>
								<img
									src={providerImageSrc[preset.provider]}
									alt={`${preset.provider} logo`}
									className="w-10 h-10 opacity-80 group-hover:opacity-100 transition-opacity"
								/>
							</div>
							<div className="flex justify-end gap-2 mt-4">
								<Button
									className="text-xs"
									variant="ghost"
									size="sm"
									onClick={(e) => {
										e.stopPropagation();
										duplicatePreset(preset.id);
									}}
									disabled={isLoading}
								>
									duplicate
								</Button>
								<Button
									className="text-xs"
									variant="ghost"
									size="sm"
									onClick={(e) => {
										e.stopPropagation();
										setPresetToSetDefault(preset.id);
									}}
									disabled={isLoading || isDefault}
								>
									{isDefault ? "current default" : "set as default"}
								</Button>
								<Button
									className="text-xs text-destructive"
									variant="ghost"
									size="sm"
									onClick={(e) => {
										e.stopPropagation();
										setPresetToDelete(preset.id);
									}}
									disabled={isLoading || isDefault}
								>
									<Trash2 className="w-3 h-3 mr-1" />
									remove
								</Button>
							</div>
						</Card>
					);
				})}
			</div>

			<AlertDialog open={!!presetToDelete} onOpenChange={() => setPresetToDelete(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							this action cannot be undone. this will permanently delete the preset.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => presetToDelete && removePreset(presetToDelete)}
						>
							{isLoading ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								"delete"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={!!presetToSetDefault}
				onOpenChange={() => setPresetToSetDefault(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>change default preset?</AlertDialogTitle>
						<AlertDialogDescription>
							this will set this preset as the default and apply its settings.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => presetToSetDefault && setDefaultPreset(presetToSetDefault)}
						>
							{isLoading ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								"continue"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
};
