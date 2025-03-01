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
	RefreshCw,
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

const AISection = ({
	preset,
	setDialog,
}: {
	preset?: AIPreset;
	setDialog: (value: boolean) => void;
}) => {
	const { settings, updateSettings } = useSettings();
	const [settingsPreset, setSettingsPreset] = useState<
		Partial<AIPreset> | undefined
	>(preset);

	const [showApiKey, setShowApiKey] = useState(false);

	const updateStoreSettings = () => {
		if (!settingsPreset?.id) {
			toast({
				title: "please enter a name of this preset",
				description: "it's required, should be unique",
				variant: "destructive",
			});
			return;
		}

		const checkIfIDPresent = settings.aiPresets.find(
			(preset) => preset.id === settingsPreset.id,
		);

		if (checkIfIDPresent) {
			toast({
				title: "name already exists",
				description: "it's required, should be unique",
				variant: "destructive",
			});
			return;
		}

		if (!settings.aiPresets.length) {
			const defaultPreset = {
				...settingsPreset,
				prompt: settingsPreset?.prompt || DEFAULT_PROMPT,
				maxContextChars: settingsPreset?.maxContextChars || 512000,
				defaultPreset: true,
			} as AIPreset;

			updateSettings({
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

			setDialog(false);
			return;
		}

		const prevPresets = settings.aiPresets;
		updateSettings({
			aiPresets: [
				...prevPresets,
				{
					...settingsPreset,

					prompt: settingsPreset?.prompt || DEFAULT_PROMPT,
					maxContextChars: settingsPreset?.maxContextChars || 512000,
					defaultPreset: false,
				} as AIPreset,
			],
		});
		setDialog(false);
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
		// updateSettings({ aiMaxContextChars: value[0] });
		updateSettingsPreset({
			maxContextChars: value[0],
		});
	};

	const handleCustomPromptChange = (
		e: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		//updateSettings({ customPrompt: e.target.value });
		updateSettingsPreset({
			prompt: e.target.value ?? DEFAULT_PROMPT,
		});
	};

	const handleResetCustomPrompt = () => {
		//resetSetting("customPrompt");
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
			//case "embedded":
			//	newUrl = `http://localhost:${settings.embeddedLLM.port}/v1`;
			//	newModel = settings.embeddedLLM.model;
			//	break;
			case "screenpipe-cloud":
				newUrl = "https://ai-proxy.i-f9f.workers.dev/v1";
				break;
			case "custom":
				newUrl = settingsPreset?.url || "";
				break;
		}

		//updateSettings({
		//	aiProviderType: newValue,
		//	aiUrl: newUrl,
		//	aiModel: newModel,
		//});

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
			<h1 className="text-2xl font-bold">ai settings</h1>
			<div className="w-full">
				<div className="flex flex-col gap-2">
					<Button
						className="w-max flex gap-2"
						variant={"link"}
						onClick={() => setDialog(false)}
					>
						<ArrowLeft className="w-4 h-4" /> Back
					</Button>
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
					<Label htmlFor="preset_id">Name</Label>
					<Input
						id="preset_id"
						value={settingsPreset?.id}
						onChange={(e) => {
							const namePreset = e.target.value;
							updateSettingsPreset({ id: namePreset });
						}}
						className="flex-grow"
						placeholder="enter name"
						autoCorrect="off"
						autoCapitalize="off"
						autoComplete="off"
						type="text"
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
								// updateSettings({ aiUrl: newUrl });
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
				<Button onClick={() => updateStoreSettings()}>Create Preset</Button>
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

	useEffect(() => {
		if (!createPresetsDialog) {
			setSelectedPreset(undefined);
		}
	}, [createPresetsDialog]);

	if (createPresetsDialog)
		return (
			<AISection setDialog={setCreatePresentDialog} preset={selectedPreset} />
		);

	const removePreset = (id: string) => {
		const checkIfDefault = settings.aiPresets.find(
			(preset) => preset.id === id,
		)?.defaultPreset;

		if (checkIfDefault) {
			toast({
				title: "default preset cannot be deleted",
				description: "preset cannot be deleted",
				variant: "destructive",
			});
			return;
		}

		const checkIfIDPresent = settings.aiPresets.find(
			(preset) => preset.id === id,
		);

		if (!checkIfIDPresent) {
			toast({
				title: "id doesn't exist",
				description: "please check if id exists",
				variant: "destructive",
			});
			return;
		}

		const filteredPresets = settings.aiPresets.filter(
			(preset) => preset.id !== id,
		);

		updateSettings({
			aiPresets: filteredPresets,
		});
	};

	return (
		<div className="w-full space-y-6 py-4">
			<h1 className="text-2xl font-bold">ai settings</h1>
			<div className="w-full flex flex-col gap-4">
				{settings.aiPresets.map((preset) => {
					return (
						<Card
							key={preset.id}
							className="py-2 px-5 relative group"
							onClick={() => {
								setSelectedPreset(preset);
								setCreatePresentDialog(true);
							}}
						>
							<div className="flex justify-between items-center">
								<div className="text-sm text-muted-foreground">
									<div className="text-lg text-foreground flex gap-2">
										{preset.id}
										{preset.defaultPreset && <Badge>default</Badge>}
									</div>
									<div>{preset.model}</div>
									<div>{preset.maxContextChars}</div>
								</div>
								<img
									src={providerImageSrc[preset.provider]}
									alt="proivder logo"
									className="w-10 h-10"
								/>
							</div>
							{
								<div className="flex justify-between">
									<Button
										className="px-0"
										disabled={preset.defaultPreset}
										variant={"link"}
										size={"sm"}
									>
										Default
									</Button>

									<Button className="px-0" variant={"link"} size={"sm"}>
										Remove
									</Button>
								</div>
							}
						</Card>
					);
				})}

				<Button onClick={() => setCreatePresentDialog(!createPresetsDialog)}>
					Create
				</Button>
			</div>
		</div>
	);
};
