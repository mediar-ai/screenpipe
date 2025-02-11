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
const lucide_react_1 = require("lucide-react");
const use_toast_1 = require("@/components/ui/use-toast");
const use_settings_1 = require("@/lib/hooks/use-settings");
const card_1 = require("@/components/ui/card");
const dialog_1 = require("@/components/ui/dialog");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const core_1 = require("@tauri-apps/api/core");
const DEV_OPTIONS = [
    {
        key: "nonDevMode",
        icon: lucide_react_1.UserRound,
        title: "standard mode",
        description: "screenpipe takes care of everything for you, making it easy and stress-free.",
    },
    {
        key: "devMode",
        icon: lucide_react_1.Wrench,
        title: "dev mode",
        description: "run the CLI on top of the UI, and customize screenpipe to fit your needs.",
    },
];
const CardItem = ({ option, isSelected, onClick }) => {
    const { icon: Icon, title, description } = option;
    return (<div className="relative group h-64">
      <div className={`absolute inset-0 rounded-lg transition-transform duration-300 ease-out group-hover:scale-105`}/>
      <card_1.Card className={`p-4 h-64 mt-[-5px] cursor-pointer bg-white dark:bg-gray-800 transition-transform duration-300 ease-out group-hover:scale-105 
        ${isSelected ? "bg-accent" : ""}`} onClick={onClick}>
        <card_1.CardContent className="flex flex-col w-60 justify-start">
          <Icon className="w-12 h-12 mx-auto"/>
          <h2 className="font-semibold text-xl text-center mt-1">{title}</h2>
          <span className="text-sm mt-0">{description}</span>
        </card_1.CardContent>
      </card_1.Card>
    </div>);
};
const OnboardingDevOrNonDev = ({ className = "", selectedPreference = "", handleOptionClick, handleNextSlide, handlePrevSlide, }) => {
    const { toast } = (0, use_toast_1.useToast)();
    const { settings, updateSettings } = (0, use_settings_1.useSettings)();
    const [localSettings, setLocalSettings] = (0, react_1.useState)(settings);
    const handleNextWithPreference = (option) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (option === "devMode") {
                yield updateSettings({ devMode: true });
                setLocalSettings(Object.assign(Object.assign({}, localSettings), { devMode: true }));
                toast({
                    title: "success",
                    description: "dev mode enabled successfully",
                    variant: "default",
                });
            }
            else if (option === "nonDevMode") {
                yield updateSettings({ devMode: false });
                setLocalSettings(Object.assign(Object.assign({}, localSettings), { devMode: false }));
                toast({
                    title: "success",
                    description: "screenpipe backend is in standard mode",
                    variant: "default",
                });
                // TODO: should give better user feedback
                yield (0, core_1.invoke)("spawn_screenpipe");
            }
        }
        catch (error) {
            toast({
                title: "error",
                description: error,
                variant: "destructive",
            });
        }
    });
    return (<div className={`${className} w-full flex justify-around flex-col relative`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          how do you prefer to use screenpipe?
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>
      <div className="flex w-full justify-around mt-12">
        {DEV_OPTIONS.map((option) => (<CardItem key={option.key} option={option} isSelected={selectedPreference === option.key} onClick={() => handleOptionClick(option.key)}/>))}
      </div>

      <navigation_1.default className="mt-9" nextBtnText="next" prevBtnText="previous" handlePrevSlide={handlePrevSlide} handleNextSlide={() => __awaiter(void 0, void 0, void 0, function* () {
            if (selectedPreference) {
                yield handleNextWithPreference(selectedPreference);
            }
            handleNextSlide();
        })}/>
    </div>);
};
exports.default = OnboardingDevOrNonDev;
