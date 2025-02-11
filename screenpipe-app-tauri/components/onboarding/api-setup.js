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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const use_toast_1 = require("@/components/ui/use-toast");
const use_settings_1 = require("@/lib/hooks/use-settings");
const card_1 = require("@/components/ui/card");
const lucide_react_1 = require("lucide-react");
const dialog_1 = require("@/components/ui/dialog");
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const ai_section_1 = __importDefault(require("../settings/ai-section"));
const OnboardingAPISetup = ({ className, handleNextSlide, handlePrevSlide, }) => {
    const { toast } = (0, use_toast_1.useToast)();
    const { settings, updateSettings } = (0, use_settings_1.useSettings)();
    const [localSettings, setLocalSettings] = react_1.default.useState(settings);
    const [areAllInputsFilled, setAreAllInputsFilled] = react_1.default.useState(false);
    const [errors, setErrors] = react_1.default.useState({});
    const [isValidating, setIsValidating] = react_1.default.useState(false);
    (0, react_1.useEffect)(() => {
        const { aiUrl, openaiApiKey, aiModel } = localSettings;
        const isApiKeyRequired = aiUrl !== "https://ai-proxy.i-f9f.workers.dev/v1" &&
            aiUrl !== "http://localhost:11434/v1";
        setAreAllInputsFilled(aiUrl.trim() !== "" &&
            aiModel.trim() !== "" &&
            (!isApiKeyRequired || openaiApiKey.trim() !== ""));
    }, [localSettings]);
    const validateInputs = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const { aiUrl, openaiApiKey, aiModel } = localSettings;
        const newErrors = {};
        try {
            const t = toast({
                title: "validating AI provider",
                description: "please wait...",
                duration: 10000,
            });
            const response = yield fetch(`${aiUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: aiModel,
                    messages: [
                        {
                            role: "user",
                            content: "You are a helpful assistant that tells short jokes.",
                        },
                        {
                            role: "user",
                            content: "Tell me a very short joke (1-2 sentences) about screen recording, AI, and screenpipe, answer in lower case only.",
                        },
                    ],
                    max_tokens: 60,
                    stream: false,
                }),
            });
            if (response.ok) {
                const data = yield response.json();
                const joke = data.choices[0].message.content.trim();
                console.log("ai is ready!", joke);
                t.update({
                    id: t.id,
                    title: "ai is ready!",
                    description: `here's a joke: ${joke}`,
                    duration: 5000,
                });
            }
            else {
                const errorData = yield response.json();
                newErrors.openaiApiKey = `invalid api key or model: ${((_a = errorData.error) === null || _a === void 0 ? void 0 : _a.message.toLowerCase()) || "unknown error"}`;
            }
        }
        catch (error) {
            newErrors.openaiApiKey = `failed to validate api key: ${error.message.toLowerCase()}`;
        }
        setErrors(newErrors);
        Object.keys(newErrors).forEach((key) => {
            toast({
                title: "api key validation error",
                description: newErrors[key],
                variant: "destructive",
            });
        });
        return Object.keys(newErrors).length === 0;
    });
    const handleValidationMoveNextSlide = () => __awaiter(void 0, void 0, void 0, function* () {
        setIsValidating(true);
        // Update settings here, before validation
        updateSettings(localSettings);
        const isValid = yield validateInputs();
        setIsValidating(false);
        if (isValid) {
            handleNextSlide();
        }
    });
    react_1.default.useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);
    return (<div className={`flex h-[80%] flex-col ${className}`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          setup your ai settings
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>
      <card_1.Card className="mt-4">
        <card_1.CardContent className="flex flex-col items-center space-y-4 max-h-[60vh] overflow-y-auto ">
          <ai_section_1.default />
          <div className="mb-16"/>
          <div className="mb-16"/>
          <div className="mb-16"/>
          <div className="mb-16"/>
          <div className="mb-16"/>
          <div className="mb-16"/>
        </card_1.CardContent>
      </card_1.Card>
      <a onClick={() => (0, plugin_shell_1.open)("https://github.com/ollama/ollama?tab=readme-ov-file#ollama")} href="#" className="mt-4 text-muted-foreground text-sm mr-auto ml-auto !text-center hover:underline">
        don&apos;t have api key ? set up ollama locally
        <lucide_react_1.ArrowUpRight className="inline w-4 h-4 ml-1 "/>
      </a>
      <navigation_1.default className="mt-8" isLoading={isValidating} handlePrevSlide={handlePrevSlide} handleNextSlide={areAllInputsFilled
            ? handleValidationMoveNextSlide
            : () => {
                updateSettings(localSettings);
                handleNextSlide();
            }} prevBtnText="previous" nextBtnText={areAllInputsFilled ? "setup" : "i'll setup later"}/>
    </div>);
};
exports.default = OnboardingAPISetup;
