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
const localforage_1 = __importDefault(require("localforage"));
const react_1 = __importStar(require("react"));
const use_toast_1 = require("@/components/ui/use-toast");
const pipes_1 = __importDefault(require("@/components/onboarding/pipes"));
const dialog_1 = require("@/components/ui/dialog");
const status_1 = __importDefault(require("@/components/onboarding/status"));
const introduction_1 = __importDefault(require("@/components/onboarding/introduction"));
const api_setup_1 = __importDefault(require("@/components/onboarding/api-setup"));
const personalize_1 = __importDefault(require("@/components/onboarding/personalize"));
const dev_or_non_dev_1 = __importDefault(require("@/components/onboarding/dev-or-non-dev"));
const dev_configuration_1 = __importDefault(require("@/components/onboarding/dev-configuration"));
const usecases_selection_1 = __importDefault(require("@/components/onboarding/usecases-selection"));
const explain_instructions_1 = __importDefault(require("@/components/onboarding/explain-instructions"));
const use_onboarding_1 = require("@/lib/hooks/use-onboarding");
const use_settings_1 = require("@/lib/hooks/use-settings");
const login_1 = __importDefault(require("./onboarding/login"));
const pipe_store_1 = __importDefault(require("./onboarding/pipe-store"));
const posthog_js_1 = __importDefault(require("posthog-js"));
const slideFlow = {
    intro: {
        // introduction video of screenpipe
        next: () => "status",
        prev: () => null,
    },
    status: {
        // status of screenpipe (blockage or not)
        next: () => "login",
        prev: () => "intro",
    },
    login: {
        // login
        next: () => "apiSetup",
        prev: () => "status",
    },
    selection: {
        // selection (four options)
        next: (selectedOptions) => {
            if (!Array.isArray(selectedOptions) || selectedOptions.length === 0)
                return null;
            return "devOrNonDev";
        },
        prev: () => "status",
    },
    personalize: {
        // personalize (with ai or without ai)
        next: (selectedOptions, __, selectedPersonalization) => {
            if (selectedPersonalization === "withAI")
                return "apiSetup";
            if ((selectedOptions === null || selectedOptions === void 0 ? void 0 : selectedOptions.includes("personalUse")) &&
                selectedPersonalization === "withoutAI")
                return "instructions";
            return "instructions";
        },
        prev: () => "selection",
    },
    apiSetup: {
        // api setup & validation
        next: () => "pipeStore",
        prev: () => "login",
    },
    pipeStore: {
        // pipe store
        next: () => null,
        prev: () => "apiSetup",
    },
    devOrNonDev: {
        // dev or no dev
        next: (selectedOptions, selectedPreference, selectedPersonalization) => {
            if ((selectedOptions === null || selectedOptions === void 0 ? void 0 : selectedOptions.includes("personalUse")) &&
                selectedPersonalization === "withoutAI" &&
                selectedPreference === "nonDevMode")
                return "instructions";
            if (selectedPreference === "devMode")
                return "devConfig";
            return "personalize";
        },
        prev: () => "selection",
    },
    devConfig: {
        // dev configuration
        next: () => "pipes",
        prev: () => "devOrNonDev",
    },
    pipes: {
        // explain about pipes to dev
        next: () => "instructions",
        prev: () => "devConfig",
    },
    instructions: {
        // instructions for every type of user
        next: () => null,
        prev: (selectedOptions, selectedPreference, selectedPersonalization) => {
            if (selectedPreference === "devMode")
                return "pipes";
            if (selectedOptions === null || selectedOptions === void 0 ? void 0 : selectedOptions.includes("personalUse"))
                return "personalize";
            if (selectedOptions === null || selectedOptions === void 0 ? void 0 : selectedOptions.includes("professionalUse"))
                return "personalize";
            if (selectedOptions === null || selectedOptions === void 0 ? void 0 : selectedOptions.includes("developmentlUse"))
                return "personalize";
            if (selectedPersonalization === "withAI")
                return "apiSetup";
            return "devOrNonDev";
        },
    },
};
const trackOnboardingStep = (step, properties) => {
    posthog_js_1.default.capture("onboarding_step", Object.assign({ step }, properties));
};
const Onboarding = () => {
    const { toast } = (0, use_toast_1.useToast)();
    const [currentSlide, setCurrentSlide] = (0, react_1.useState)("intro");
    const [selectedOptions, setSelectedOptions] = (0, react_1.useState)([]); // use case selection (four options)
    const [selectedPersonalization, setSelectedPersonalization] = (0, react_1.useState)(null); // with ai or without ai
    const [selectedPreference, setSelectedPreference] = (0, react_1.useState)(null); // dev or non dev
    const [error, setError] = (0, react_1.useState)(null);
    const [isVisible, setIsVisible] = (0, react_1.useState)(false);
    const { showOnboarding, setShowOnboarding } = (0, use_onboarding_1.useOnboarding)();
    const { updateSettings } = (0, use_settings_1.useSettings)();
    (0, react_1.useEffect)(() => {
        setIsVisible(true);
    }, [currentSlide]);
    (0, react_1.useEffect)(() => {
        if (showOnboarding) {
            const hideCloseButton = () => {
                const closeButton = document.querySelector(".lucide-x");
                if (closeButton) {
                    closeButton.classList.add("hidden");
                }
            };
            setTimeout(hideCloseButton, 100);
        }
    }, [showOnboarding]);
    (0, react_1.useEffect)(() => {
        if (error) {
            toast({
                title: "error",
                description: error,
                variant: "destructive",
            });
        }
    }, [error, toast]);
    const handleNextSlide = () => {
        const nextSlide = slideFlow[currentSlide].next(selectedOptions, selectedPreference, selectedPersonalization);
        trackOnboardingStep(currentSlide, {
            selectedOptions,
            selectedPreference,
            selectedPersonalization,
            direction: "next",
        });
        if (currentSlide === "selection" &&
            (!selectedOptions || selectedOptions.length === 0)) {
            setError("please select at least one option before proceeding!");
            return;
        }
        if (currentSlide === "personalize" && !selectedPersonalization) {
            setError("please choose a personalization option!");
            return;
        }
        if (currentSlide === "devOrNonDev" && !selectedPreference) {
            setError("please choose a preference option!");
            return;
        }
        if (nextSlide) {
            setIsVisible(false);
            setTimeout(() => {
                setCurrentSlide(nextSlide);
                setError(null);
            }, 300);
        }
        else {
            setError("Please validate selection");
        }
    };
    const handlePrevSlide = () => {
        setIsVisible(false);
        trackOnboardingStep(currentSlide, {
            selectedOptions,
            selectedPreference,
            selectedPersonalization,
            direction: "back",
        });
        setTimeout(() => {
            const prevSlide = slideFlow[currentSlide].prev(selectedOptions, selectedPreference, selectedPersonalization);
            if (prevSlide) {
                setError(null);
                setCurrentSlide(prevSlide);
            }
        }, 300);
    };
    const handleOptionClick = (option) => {
        setSelectedOptions((prevOptions) => prevOptions.includes(option)
            ? prevOptions.filter((opt) => opt !== option)
            : [...prevOptions, option]);
        setError(null);
    };
    const handleDialogClose = (open) => {
        if (!open && currentSlide) {
            setShowOnboarding(open);
        }
    };
    const handleEnd = () => __awaiter(void 0, void 0, void 0, function* () {
        trackOnboardingStep("completed", {
            finalOptions: selectedOptions,
            finalPreference: selectedPreference,
            finalPersonalization: selectedPersonalization,
        });
        setShowOnboarding(false);
        localforage_1.default.setItem("showOnboarding", false);
    });
    return (<dialog_1.Dialog open={showOnboarding} onOpenChange={handleDialogClose}>
      <dialog_1.DialogContent className="max-w-4xl h-[640px] max-h-[100vh]">
        <div className="flex flex-col w-full h-full overflow-hidden">
          {currentSlide === "intro" && (<introduction_1.default className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleNextSlide={handleNextSlide}/>)}
          {currentSlide === "status" && (<status_1.default className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide}/>)}
          {currentSlide === "login" && (<login_1.default className={`transition-opacity duration-300 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleNextSlide={handleNextSlide} handlePrevSlide={handlePrevSlide}/>)}
          {currentSlide === "selection" && (<usecases_selection_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleOptionClick={handleOptionClick} selectedOptions={selectedOptions} handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide}/>)}
          {currentSlide === "personalize" && (<personalize_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleOptionClick={setSelectedPersonalization} selectedPersonalization={selectedPersonalization} handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide}/>)}
          {currentSlide === "apiSetup" && (<api_setup_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleNextSlide={handleNextSlide} handlePrevSlide={handlePrevSlide}/>)}
          {currentSlide === "pipeStore" && (<pipe_store_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleNextSlide={handleEnd} handlePrevSlide={handlePrevSlide}/>)}
          {currentSlide === "devOrNonDev" && (<dev_or_non_dev_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleOptionClick={setSelectedPreference} selectedPreference={selectedPreference} handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide}/>)}
          {currentSlide === "devConfig" && (<dev_configuration_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleNextSlide={handleNextSlide} handlePrevSlide={handlePrevSlide}/>)}
          {currentSlide === "pipes" && (<pipes_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleNextSlide={handleNextSlide} handlePrevSlide={handlePrevSlide}/>)}
          {currentSlide === "instructions" && (<explain_instructions_1.default className={`transition-opacity duration-300 ease-in-out 
              ${isVisible ? "opacity-100 ease-out" : "opacity-0 ease-in"}`} handleNextSlide={handleEnd} handlePrevSlide={handlePrevSlide}/>)}
        </div>
      </dialog_1.DialogContent>
    </dialog_1.Dialog>);
};
exports.default = Onboarding;
