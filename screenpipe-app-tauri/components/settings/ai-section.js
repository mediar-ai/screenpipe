"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @next/next/no-img-element */
const use_settings_1 = require("@/lib/hooks/use-settings");
const label_1 = require("@/components/ui/label");
const slider_1 = require("@/components/ui/slider");
const tooltip_1 = require("@/components/ui/tooltip");
const lucide_react_1 = require("lucide-react");
const badge_1 = require("@/components/ui/badge");
const react_1 = __importStar(require("react"));
const input_1 = require("../ui/input");
const textarea_1 = require("../ui/textarea");
const button_1 = require("../ui/button");
const utils_1 = require("@/lib/utils");
const card_1 = require("../ui/card");
const command_1 = require("@/components/ui/command");
const popover_1 = require("@/components/ui/popover");
const AIProviderCard = ({ type, title, description, imageSrc, selected, onClick, disabled, warningText, imageClassName, }) => {
    return (<card_1.Card onClick={onClick} className={(0, utils_1.cn)("flex py-4 px-4 rounded-lg hover:bg-accent transition-colors h-[145px] w-full cursor-pointer", selected ? "border-black/60 border-[1.5px]" : "", disabled && "opacity-50 cursor-not-allowed")}>
      <card_1.CardContent className="flex flex-col p-0 w-full">
        <div className="flex items-center gap-2 mb-2">
          <img src={imageSrc} alt={title} className={(0, utils_1.cn)("rounded-lg shrink-0 size-8", type === "native-ollama" &&
            "outline outline-gray-300 outline-1 outline-offset-2", imageClassName)}/>
          <span className="text-lg font-medium truncate">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">
          {description}
        </p>
        {warningText && <badge_1.Badge className="w-fit mt-2">{warningText}</badge_1.Badge>}
      </card_1.CardContent>
    </card_1.Card>);
};
const AISection = () => {
    var _a, _b;
    const { settings, updateSettings, resetSetting } = (0, use_settings_1.useSettings)();
    const [showApiKey, setShowApiKey] = react_1.default.useState(false);
    const handleApiKeyChange = (e) => {
        updateSettings({ openaiApiKey: e.target.value });
    };
    const handleMaxContextCharsChange = (value) => {
        updateSettings({ aiMaxContextChars: value[0] });
    };
    const handleCustomPromptChange = (e) => {
        updateSettings({ customPrompt: e.target.value });
    };
    const handleResetCustomPrompt = () => {
        resetSetting("customPrompt");
    };
    const handleAiProviderChange = (newValue) => {
        let newUrl = "";
        let newModel = settings.aiModel;
        switch (newValue) {
            case "openai":
                newUrl = "https://api.openai.com/v1";
                break;
            case "native-ollama":
                newUrl = "http://localhost:11434/v1";
                break;
            case "embedded":
                newUrl = `http://localhost:${settings.embeddedLLM.port}/v1`;
                newModel = settings.embeddedLLM.model;
                break;
            case "screenpipe-cloud":
                newUrl = "https://ai-proxy.i-f9f.workers.dev/v1";
                break;
            case "custom":
                newUrl = settings.aiUrl;
                break;
        }
        updateSettings({
            aiProviderType: newValue,
            aiUrl: newUrl,
            aiModel: newModel,
        });
    };
    const isApiKeyRequired = settings.aiUrl !== "https://ai-proxy.i-f9f.workers.dev/v1" &&
        settings.aiUrl !== "http://localhost:11434/v1" &&
        settings.aiUrl !== "embedded";
    const [models, setModels] = (0, react_1.useState)([]);
    const [isLoadingModels, setIsLoadingModels] = (0, react_1.useState)(false);
    const fetchModels = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        setIsLoadingModels(true);
        console.log(settings.aiProviderType, settings.openaiApiKey, settings.aiUrl);
        try {
            switch (settings.aiProviderType) {
                case "screenpipe-cloud":
                    const response = yield fetch("https://ai-proxy.i-f9f.workers.dev/v1/models", {
                        headers: {
                            Authorization: `Bearer ${((_a = settings.user) === null || _a === void 0 ? void 0 : _a.id) || ""}`,
                        },
                    });
                    if (!response.ok)
                        throw new Error("Failed to fetch models");
                    const data = yield response.json();
                    setModels(data.models);
                    break;
                case "native-ollama":
                    const ollamaResponse = yield fetch("http://localhost:11434/api/tags");
                    if (!ollamaResponse.ok)
                        throw new Error("Failed to fetch Ollama models");
                    const ollamaData = (yield ollamaResponse.json());
                    setModels((ollamaData.models || []).map((model) => ({
                        id: model.name,
                        name: model.name,
                        provider: "ollama",
                    })));
                    break;
                case "openai":
                    setModels([
                        { id: "gpt-4", name: "gpt-4", provider: "openai" },
                        { id: "gpt-3.5-turbo", name: "gpt-3.5-turbo", provider: "openai" },
                    ]);
                    break;
                case "custom":
                    try {
                        const customResponse = yield fetch(`${settings.aiUrl}/models`, {
                            headers: settings.openaiApiKey
                                ? { Authorization: `Bearer ${settings.openaiApiKey}` }
                                : {},
                        });
                        if (!customResponse.ok)
                            throw new Error("Failed to fetch custom models");
                        const customData = yield customResponse.json();
                        console.log(customData);
                        setModels((customData.data || []).map((model) => ({
                            id: model.id,
                            name: model.id,
                            provider: "custom",
                        })));
                    }
                    catch (error) {
                        console.error("Failed to fetch custom models, allowing manual input:", error);
                        setModels([]);
                    }
                    break;
                default:
                    setModels([]);
            }
        }
        catch (error) {
            console.error(`Failed to fetch models for ${settings.aiProviderType}:`, error);
            setModels([]);
        }
        finally {
            setIsLoadingModels(false);
        }
    });
    (0, react_1.useEffect)(() => {
        fetchModels();
    }, [settings.aiProviderType, settings.openaiApiKey, settings.aiUrl]);
    return (<div className="w-full space-y-6 py-4">
      <h1 className="text-2xl font-bold">ai settings</h1>
      <div className="w-full">
        <label_1.Label htmlFor="aiUrl" className="min-w-[80px]">
          ai provider
        </label_1.Label>
        <div className="grid grid-cols-2 gap-4 mb-4 mt-4">
          <AIProviderCard type="openai" title="openai" description="use your own openai api key for gpt-4 and other models" imageSrc="/images/openai.png" selected={settings.aiProviderType === "openai"} onClick={() => handleAiProviderChange("openai")}/>

          <AIProviderCard type="screenpipe-cloud" title="screenpipe cloud" description="use openai, anthropic and google models without worrying about api keys or usage" imageSrc="/images/screenpipe.png" selected={settings.aiProviderType === "screenpipe-cloud"} onClick={() => handleAiProviderChange("screenpipe-cloud")} disabled={!settings.user} warningText={!settings.user
            ? "login required"
            : !((_b = (_a = settings.user) === null || _a === void 0 ? void 0 : _a.credits) === null || _b === void 0 ? void 0 : _b.amount)
                ? "requires credits"
                : undefined}/>

          <AIProviderCard type="native-ollama" title="ollama" description="run ai models locally using your existing ollama installation" imageSrc="/images/ollama.png" selected={settings.aiProviderType === "native-ollama"} onClick={() => handleAiProviderChange("native-ollama")}/>

          <AIProviderCard type="custom" title="custom" description="connect to your own ai provider or self-hosted models" imageSrc="/images/custom.png" selected={settings.aiProviderType === "custom"} onClick={() => handleAiProviderChange("custom")}/>
        </div>
      </div>
      {settings.aiProviderType === "custom" && (<div className="w-full">
          <div className="flex flex-col gap-4 mb-4">
            <label_1.Label htmlFor="customAiUrl">custom url</label_1.Label>
            <input_1.Input id="customAiUrl" value={settings.aiUrl} onChange={(e) => {
                const newUrl = e.target.value;
                updateSettings({ aiUrl: newUrl });
            }} className="flex-grow" placeholder="enter custom ai url" autoCorrect="off" autoCapitalize="off" autoComplete="off" type="text"/>
          </div>
        </div>)}
      {isApiKeyRequired && (<div className="w-full">
          <div className="flex flex-col gap-4 mb-4 w-full">
            <label_1.Label htmlFor="aiApiKey">API Key</label_1.Label>
            <div className="flex-grow relative">
              <input_1.Input id="aiApiKey" type={showApiKey ? "text" : "password"} value={settings.openaiApiKey} onChange={handleApiKeyChange} className="pr-10" placeholder="enter your ai api key" autoCorrect="off" autoCapitalize="off" autoComplete="off"/>
              <button_1.Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? (<lucide_react_1.EyeOff className="h-4 w-4"/>) : (<lucide_react_1.Eye className="h-4 w-4"/>)}
              </button_1.Button>
            </div>
          </div>
        </div>)}
      {settings.aiProviderType !== "embedded" && (<div className="w-full">
          <div className="flex flex-col gap-4 mb-4 w-full">
            <label_1.Label htmlFor="aiModel">ai model</label_1.Label>
            <popover_1.Popover modal={true}>
              <popover_1.PopoverTrigger asChild>
                <button_1.Button variant="outline" role="combobox" className="w-full justify-between">
                  {settings.aiModel || "select model..."}
                  <lucide_react_1.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                </button_1.Button>
              </popover_1.PopoverTrigger>
              <popover_1.PopoverContent className="w-full p-0">
                <command_1.Command>
                  <command_1.CommandInput placeholder="select or type model name" onValueChange={(value) => {
                if (value) {
                    updateSettings({ aiModel: value });
                }
            }}/>
                  <command_1.CommandList>
                    <command_1.CommandEmpty>
                      press enter to use &quot;{settings.aiModel}&quot;
                    </command_1.CommandEmpty>
                    <command_1.CommandGroup heading="Suggestions">
                      {isLoadingModels ? (<command_1.CommandItem value="loading" disabled>
                          <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                          loading models...
                        </command_1.CommandItem>) : (models.map((model) => (<command_1.CommandItem key={model.id} value={model.id} onSelect={() => {
                    updateSettings({ aiModel: model.id });
                }}>
                            {model.name}
                            <badge_1.Badge variant="outline" className="ml-2">
                              {model.provider}
                            </badge_1.Badge>
                          </command_1.CommandItem>)))}
                    </command_1.CommandGroup>
                  </command_1.CommandList>
                </command_1.Command>
              </popover_1.PopoverContent>
            </popover_1.Popover>
          </div>
        </div>)}

      <div className="w-full">
        <div className="flex flex-col gap-4 mb-4 w-full">
          <label_1.Label htmlFor="customPrompt">prompt</label_1.Label>
          <div className="flex-grow relative">
            <textarea_1.Textarea id="customPrompt" value={settings.customPrompt} onChange={handleCustomPromptChange} className="min-h-[100px]" placeholder="enter your custom prompt here"/>
            <button_1.Button type="button" variant="ghost" size="sm" className="absolute right-2 top-2" onClick={handleResetCustomPrompt}>
              <lucide_react_1.RefreshCw className="h-4 w-4 mr-2"/>
              reset
            </button_1.Button>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="flex flex-col gap-4 mb-4 w-full">
          <label_1.Label htmlFor="aiMaxContextChars" className="flex items-center">
            max context{" "}
            <tooltip_1.TooltipProvider>
              <tooltip_1.Tooltip>
                <tooltip_1.TooltipTrigger asChild>
                  <lucide_react_1.HelpCircle className="ml-2 h-4 w-4 cursor-default"/>
                </tooltip_1.TooltipTrigger>
                <tooltip_1.TooltipContent side="left">
                  <p>
                    maximum number of characters (think 4 characters per token)
                    to send to the ai model. <br />
                    usually, openai models support up to 200k tokens, which is
                    roughly 1m characters. <br />
                    we&apos;ll use this for UI purposes to show you how much you
                    can send.
                  </p>
                </tooltip_1.TooltipContent>
              </tooltip_1.Tooltip>
            </tooltip_1.TooltipProvider>
          </label_1.Label>
          <div className="flex-grow flex items-center">
            <slider_1.Slider id="aiMaxContextChars" min={10000} max={1000000} step={10000} value={[settings.aiMaxContextChars]} onValueChange={handleMaxContextCharsChange} className="flex-grow"/>
            <span className="ml-2 min-w-[60px] text-right">
              {settings.aiMaxContextChars.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>);
};
exports.default = AISection;
