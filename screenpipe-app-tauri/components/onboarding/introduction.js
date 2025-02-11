"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const dialog_1 = require("@/components/ui/dialog");
const button_1 = require("@/components/ui/button");
const rainbow_button_1 = require("../ui/rainbow-button");
const lucide_react_1 = require("lucide-react");
const posthog_js_1 = __importDefault(require("posthog-js"));
const use_onboarding_1 = require("@/lib/hooks/use-onboarding");
const OnboardingIntro = ({ className = "", handleNextSlide, }) => {
    const { setShowOnboarding } = (0, use_onboarding_1.useOnboarding)();
    const handleSkip = () => {
        setShowOnboarding(false);
        posthog_js_1.default.capture("onboarding_skipped");
    };
    return (<div className={` flex justify-center items-center flex-col ${className}`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          where pixels become magic
        </dialog_1.DialogTitle>
        <h2 className="text-center text-sm">
          welcome to screenpipe, excited to have you here
        </h2>
      </dialog_1.DialogHeader>
      <video width="600px" className="mt-2 rounded-md" autoPlay controls preload="true">
        <source src="/onboarding-screenpipe.mp4" type="video/mp4"/>
        your browser does not support the video tag.
      </video>
      <div className="flex gap-4 mt-4">
        <button_1.Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
          skip onboarding
        </button_1.Button>
        <rainbow_button_1.RainbowButton onClick={handleNextSlide}>
          get started
          <lucide_react_1.ArrowRight className="w-4 h-4 ml-2"/>
        </rainbow_button_1.RainbowButton>
      </div>
    </div>);
};
exports.default = OnboardingIntro;
