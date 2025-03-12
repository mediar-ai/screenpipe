import { usePipeSettings } from "@/lib/hooks/use-pipe-settings";
import { useSettings, type PipeSettings } from "@/lib/hooks/use-settings";
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
  Terminal,
  Loader2,
  HelpCircle,
  Eye,
  EyeOff,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Slider } from "./ui/slider";

export const Icons = {
  openai: (props: any) => (
    <svg
      fill="currentColor"
      viewBox="0 0 24 24"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.0264 1.1706a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4929 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0264 1.1706a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0788 3.7951-5.8144-3.3543 2.0264-1.1706a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4068-.6813zm2.0834-3.0089-.142-.0852-4.7782-2.7913a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1658a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654 2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  ),
  settings: Settings,
  terminal: Terminal,
  spinner: Loader2,
};

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

interface AIProviderConfigProps {
  onSubmit: (data: AIProviderData) => void;
  defaultPreset?: {
    provider: "openai" | "native-ollama" | "custom" | "screenpipe-cloud";
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
    maxContextChars?: number;
    prompt?: string;
    id?: string;
  };
}

interface AIProviderData {
  provider: "openai" | "native-ollama" | "custom" | "screenpipe-cloud";
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  maxContextChars?: number;
  prompt?: string;
  id?: string;
}

interface OpenAIModel {
  id: string;
  created?: number;
  owned_by?: string;
}

export const DEFAULT_PROMPT = `Rules:
- You can analyze/view/show/access videos to the user by putting .mp4 files in a code block (we'll render it) like this: \`/users/video.mp4\`, use the exact, absolute, file path from file_path property
- Do not try to embed video in links (e.g. [](.mp4) or https://.mp4) instead put the file_path in a code block using backticks
- Do not put video in multiline code block it will not render the video (e.g. \`\`\`bash\n.mp4\`\`\` IS WRONG) instead using inline code block with single backtick
- Always answer my question/intent, do not make up things
`;

export function AIProviderConfig({
  onSubmit,
  defaultPreset,
}: AIProviderConfigProps) {
  const [selectedProvider, setSelectedProvider] = useState<
    AIProviderData["provider"]
  >(defaultPreset?.provider || "openai");
  const { settings } = useSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [openaiModels, setOpenAIModels] = useState<OpenAIModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState<AIProviderData>({
    provider: defaultPreset?.provider || "openai",
    apiKey: defaultPreset?.apiKey || "",
    baseUrl: defaultPreset?.baseUrl || "",
    modelName: defaultPreset?.modelName || "",
    maxContextChars: defaultPreset?.maxContextChars || 512000,
    prompt: defaultPreset?.prompt || DEFAULT_PROMPT,
    id: defaultPreset?.id || "",
  });

  const validateId = (id: string | undefined): boolean => {
    if (!id?.trim()) {
      setIdError("name is required");
      return false;
    }

    // Check if ID ends with 'copy' (case insensitive)
    if (id.trim().toLowerCase().endsWith("copy")) {
      setIdError("name cannot end with 'copy'");
      return false;
    }

    // Check for duplicate IDs, excluding the current preset being edited
    const isDuplicate = settings?.aiPresets?.some(
      (preset) =>
        preset.id.toLowerCase() === id.toLowerCase() &&
        preset.id !== defaultPreset?.id,
    );

    if (isDuplicate) {
      setIdError("name already exists");
      return false;
    }

    setIdError(null);
    return true;
  };

  const handleIdChange = (value: string) => {
    setFormData((prev) => ({ ...prev, id: value }));
    validateId(value);
  };

  const fetchOpenAIModels = async (baseUrl: string, apiKey: string) => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("failed to fetch models");
      }

      const data = await response.json();
      setOpenAIModels(data.data || []);
    } catch (error) {
      console.error("error fetching models:", error);
      setOpenAIModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const fetchOllamaModels = async (baseUrl: string) => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`${baseUrl}/models`);

      if (!response.ok) {
        throw new Error("failed to fetch ollama models");
      }

      const data = (await response.json()) as {
        data: OpenAIModel[];
      };
      setOpenAIModels(data.data || []);
    } catch (error) {
      console.error("error fetching ollama models:", error);
      setOpenAIModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    setOpenAIModels([]);
    if (selectedProvider === "openai" && formData.apiKey) {
      setOpenAIModels([
        { id: "gpt-4" },
        {
          id: "gpt-3.5-turbo",
        },
      ]);
    } else if (selectedProvider === "native-ollama") {
      const baseUrl = "http://localhost:11434/v1";
      fetchOllamaModels(baseUrl);
    } else if (selectedProvider === "screenpipe-cloud") {
      fetchOpenAIModels(
        "https://ai-proxy.i-f9f.workers.dev/v1",
        settings?.user?.token ?? "",
      );
    } else if (
      selectedProvider === "custom" &&
      formData.baseUrl &&
      formData.apiKey
    ) {
      fetchOpenAIModels(formData.baseUrl, formData.apiKey);
    }
  }, [selectedProvider, formData.apiKey, formData.baseUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateId(formData.id)) {
      return;
    }

    setIsLoading(true);
    try {
      onSubmit({
        ...formData,
        id: formData.id?.trim() || "",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6 rounded-lg bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">
          {defaultPreset?.id ? "edit ai provider" : "ai provider"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {defaultPreset?.id
            ? "modify your ai provider settings"
            : "configure your ai provider settings"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-2">
            name
            {idError && (
              <span className="text-xs text-destructive font-normal">
                {idError}
              </span>
            )}
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="enter preset name"
            value={formData.id || undefined}
            onChange={(e) => handleIdChange(e.target.value)}
            className={cn(
              "font-mono",
              idError && "border-destructive focus-visible:ring-destructive",
            )}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            disabled={
              Boolean(defaultPreset?.id) &&
              !defaultPreset?.id?.endsWith("-copy")
            }
          />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Button
            type="button"
            variant={selectedProvider === "openai" ? "default" : "outline"}
            className="flex h-24 flex-col items-center justify-center gap-2"
            onClick={() => {
              setSelectedProvider("openai");
              setFormData({ ...formData, provider: "openai" });
            }}
          >
            <Icons.openai className="h-8 w-8" />
            <span>openai</span>
          </Button>

          <Button
            type="button"
            variant={
              selectedProvider === "native-ollama" ? "default" : "outline"
            }
            className="flex h-24 flex-col items-center justify-center gap-2"
            onClick={() => {
              setSelectedProvider("native-ollama");
              setFormData({
                ...formData,
                provider: "native-ollama",
                baseUrl: "http://localhost:11434/v1",
              });
            }}
          >
            <Icons.terminal className="h-8 w-8" />
            <span>ollama</span>
          </Button>

          <Button
            type="button"
            disabled={!settings?.user?.token}
            variant={
              selectedProvider === "screenpipe-cloud" ? "default" : "outline"
            }
            className="flex h-24 flex-col items-center justify-center gap-2"
            onClick={() => {
              setSelectedProvider("screenpipe-cloud");
              setFormData({
                ...formData,
                provider: "screenpipe-cloud",
                baseUrl: "https://ai-proxy.i-f9f.workers.dev/v1",
              });
            }}
          >
            <Icons.terminal className="h-8 w-8" />
            <span>screenpipe</span>
            {!settings?.user?.token && (
              <span className="text-xs text-destructive font-normal">
                login to screenpipe to use this provider
              </span>
            )}
          </Button>

          <Button
            type="button"
            variant={selectedProvider === "custom" ? "default" : "outline"}
            className="flex h-24 flex-col items-center justify-center gap-2"
            onClick={() => {
              setSelectedProvider("custom");
              setFormData({
                ...formData,
                provider: "custom",
                baseUrl: "http://localhost:11434/v1",
              });
            }}
          >
            <Icons.settings className="h-8 w-8" />
            <span>custom</span>
          </Button>
        </div>

        {selectedProvider === "openai" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">api key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={formData.apiKey || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, apiKey: e.target.value })
                  }
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
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
            <div className="space-y-2">
              <Label htmlFor="model">model</Label>
              <Select
                value={formData.modelName}
                onValueChange={(value) =>
                  setFormData({ ...formData, modelName: value })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingModels ? "loading models..." : "select model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {openaiModels.length > 0 ? (
                    openaiModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.id}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-models" disabled>
                      {isLoadingModels ? "loading..." : "no models found"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {selectedProvider === "native-ollama" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">base url</Label>
              <Input
                id="baseUrl"
                type="text"
                placeholder="http://localhost:11434"
                value={formData.baseUrl || ""}
                onChange={(e) =>
                  setFormData({ ...formData, baseUrl: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">model</Label>
              <Select
                value={formData.modelName}
                onValueChange={(value) =>
                  setFormData({ ...formData, modelName: value })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingModels ? "loading models..." : "select model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {openaiModels.length > 0 ? (
                    openaiModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.id}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-models" disabled>
                      {isLoadingModels ? "loading..." : "no models found"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {selectedProvider === "screenpipe-cloud" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model">model</Label>
              <Select
                value={formData.modelName}
                onValueChange={(value) =>
                  setFormData({ ...formData, modelName: value })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingModels ? "loading models..." : "select model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {openaiModels.length > 0 ? (
                    openaiModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.id}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-models" disabled>
                      {isLoadingModels ? "loading..." : "no models found"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {selectedProvider === "custom" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="baseUrl">base url</Label>
              <Input
                id="baseUrl"
                type="text"
                placeholder="https://api.example.com/v1"
                value={formData.baseUrl || ""}
                onChange={(e) =>
                  setFormData({ ...formData, baseUrl: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">api key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  placeholder="your-api-key"
                  value={formData.apiKey || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, apiKey: e.target.value })
                  }
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
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
            <div className="space-y-2">
              <Label htmlFor="model">model</Label>
              <Select
                value={formData.modelName}
                onValueChange={(value) =>
                  setFormData({ ...formData, modelName: value })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingModels ? "loading models..." : "select model"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {openaiModels.length > 0 ? (
                    openaiModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.id}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-models" disabled>
                      {isLoadingModels ? "loading..." : "no models found"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="maxContextChars" className="flex items-center">
              max context{" "}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="ml-2 h-4 w-4 cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      maximum number of characters (think 4 characters per
                      token) to send to the ai model. <br />
                      usually, openai models support up to 200k tokens, which is
                      roughly 1m characters.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                id="maxContextChars"
                min={10000}
                max={1000000}
                step={10000}
                value={[formData.maxContextChars || 512000]}
                onValueChange={([value]) =>
                  setFormData({ ...formData, maxContextChars: value })
                }
                className="flex-grow"
              />
              <span className="min-w-[60px] text-right">
                {((formData.maxContextChars || 512000) / 1000).toFixed(0)}k
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">prompt</Label>
            <Textarea
              id="prompt"
              value={formData.prompt || DEFAULT_PROMPT}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setFormData({ ...formData, prompt: e.target.value })
              }
              placeholder="enter your custom prompt here"
              className="min-h-[100px]"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={
            isLoading ||
            Boolean(!formData.id?.length && !formData.modelName?.length)
          }
        >
          {isLoading ? (
            <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {defaultPreset ? "save changes" : "continue"}
        </Button>
      </form>
    </div>
  );
}

interface AIPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (preset: Partial<AIPreset>) => void;
  preset?: AIPreset;
}

interface AIPresetsSelectorProps {
  recommendedPresets?: RecommendedPreset[];
  pipeName: string;
  aiKey?: keyof PipeSettings;
  shortcutKey?: string;
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

export const AIPresetsSelector = ({
  recommendedPresets,
  pipeName,
  aiKey = "aiPresetId",
  shortcutKey = "/",
}: AIPresetsSelectorProps) => {
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
      (preset) => preset.id == pipeSettings?.[aiKey],
    );

    return preset?.id;
  }, [settings?.aiPresets, pipeSettings?.[aiKey]]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl + /
      if ((e.metaKey || e.ctrlKey) && e.key === shortcutKey) {
        e.preventDefault();
        if (!aiPresets.length) return;

        const currentIndex = selectedPreset
          ? aiPresets.findIndex((p) => p.id === selectedPreset)
          : -1;
        const nextIndex = (currentIndex + 1) % aiPresets.length;
        const nextPreset = aiPresets[nextIndex];

        updatePipeSettings({
          [aiKey]: nextPreset.id,
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

    if (pipeSettings?.[aiKey] === preset.id) {
      updatePipeSettings({
        [aiKey]: "",
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
                        {
                          aiPresets.find(
                            (preset) => preset.id === selectedPreset,
                          )?.id
                        }
                      </span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-hidden">
                        <span className="rounded bg-muted px-1.5 py-0.5 whitespace-nowrap">
                          {
                            aiPresets.find(
                              (preset) => preset.id === selectedPreset,
                            )?.provider
                          }
                        </span>
                        <span className="hidden sm:block truncate max-w-[30%]">
                          {
                            aiPresets.find(
                              (preset) => preset.id === selectedPreset,
                            )?.model
                          }
                        </span>
                        <span className="whitespace-nowrap">
                          {(
                            (aiPresets.find(
                              (preset) => preset.id === selectedPreset,
                            )?.maxContextChars || 0) / 1000
                          ).toFixed(0)}
                          k
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
                  <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">
                    ⌘/
                  </kbd>
                  <span>to cycle presets</span>
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent className="min-w-[500px] w-[--radix-popover-trigger-width] p-0">
            <Command>
              <CommandInput placeholder="search presets..." />
              <CommandEmpty>no presets found.</CommandEmpty>
              {recommendedPresets && recommendedPresets.length > 0 && (
                <CommandGroup heading="Recommended Presets">
                  {recommendedPresets.map((preset) => (
                    <CommandItem
                      key={`${preset.id}-recommended`}
                      value={`${preset.id}-recommened`}
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
                                  id: `${preset.id}`,
                                  url:
                                    preset.provider === "openai"
                                      ? "https://api.openai.com/v1"
                                      : preset.provider === "screenpipe-cloud"
                                        ? "https://ai-proxy.i-f9f.workers.dev/v1"
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
                        [aiKey]:
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
