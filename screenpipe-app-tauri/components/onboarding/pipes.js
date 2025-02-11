"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const lucide_react_1 = require("lucide-react");
const dialog_1 = require("@/components/ui/dialog");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const plugin_shell_1 = require("@tauri-apps/plugin-shell");
const OnboardingPipes = ({ className = "", handlePrevSlide, handleNextSlide, }) => {
    return (<div className={`${className} w-full flex justify-center flex-col`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          screenpipe tips
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>
      <div className="mt-32 w-full flex justify-around flex-col text-center">
        <div className="mx-3">
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              screenpipe is built to be fully extensible,
            </span>
            allowing you to enhance its capabilities with custom pipes,
            versatile plugins that streamline workflow automation for analyzing,
            managing your captured data.
          </p>
          <p className="mt-4 text-muted-foreground text-[14px]">
            we offer bounties for pipes or make it easy for you to monetize it
            through Stripe & our pipe store!
          </p>
        </div>

        <a onClick={() => (0, plugin_shell_1.open)("https://docs.screenpi.pe/docs/plugins#quick-tour---developing-pipes-in-screenpipe")} href="#" className="mt-4 text-muted-foreground text-sm mr-auto ml-auto !text-center hover:underline">
          checkout our docs for creating your own pipe!
          <lucide_react_1.ArrowUpRight className="inline w-4 h-4 ml-1 "/>
        </a>
      </div>
      <navigation_1.default className="mt-8" handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide} prevBtnText="previous" nextBtnText="next"/>
    </div>);
};
exports.default = OnboardingPipes;
