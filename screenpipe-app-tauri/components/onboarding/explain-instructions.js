"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const dialog_1 = require("@/components/ui/dialog");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const OnboardingInstructions = ({ className = "", handlePrevSlide, handleNextSlide, }) => {
    return (<div className={`${className} w-full flex justify-center flex-col overflow-y-auto`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          screenpipe tips
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>
      <div className="flex justify-center">
        <div className="h-[1px] w-40 rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
        <div className="h-[1px] w-40 rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
      </div>
      <div className="mt-2 w-full flex justify-around flex-col ">
        <div className="mx-4 mb-2">
          <h2 className="font-semibold text-md">search functionality:</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              on screenpipe&apos;s main menu,
            </span>
            you&apos;ll find an advanced search interface to query your 24/7 screen & mic recordings. it
            lets you select specific results for ai summarization and chatting,
            providing valuable insights.
            <br />
            use cases:
            <ul>
              <li>- meeting or general conversation summaries</li>
              <li>- activity summaries (youtube, browsing, etc.)</li>
              <li>- education (lecture, tutorial, etc.)</li>
              <li>- etc.</li>
            </ul>
          </p>
        </div>
        <div className="flex justify-center">
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
        </div>
        <div className="mx-4 mb-2">
          <h2 className="font-medium text-md">status menu:</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              screenpipe status menu serves
            </span>
            as a health and process monitor and allows you to adjust advanced
            preferences for the recording processes
          </p>
        </div>
        <div className="flex justify-center">
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
          <div className="h-[1px] w-[80%] rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
        </div>
        <div className="mx-4 mb-2">
          <h2 className="font-medium text-md">settings menu:</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              the settings menu,
            </span>
            is where you can configure various options like recording
            settings and ai preferences
          </p>
        </div>
        <div className="flex justify-center">
          <div className="h-[1px] w-40 rounded-full bg-gradient-to-l from-slate-500/30 to-transparent"></div>
          <div className="h-[1px] w-40 rounded-full bg-gradient-to-r from-slate-500/30 to-transparent"></div>
        </div>
        <div className="mx-4">
          <h2 className="font-medium text-md">
            meetings tracking (experimental):
          </h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              this features of screenpipe
            </span>
            tracks your meetings and generates
            summaries for you using ai
          </p>
        </div>
        <div className="mx-4">
          <h2 className="font-medium text-md">pipe store (experimental):</h2>
          <p className="text-muted-foreground text-[14px]">
            <span className="font-medium text-nowrap text-[14px] prose mr-1">
              this features of screenpipe
            </span>
            extend your 24/7 data through plugins you can install in seconds,
            create, share and sell your own
          </p>
        </div>
      </div>

      <div className="h-[100px] my-16"/>

      <navigation_1.default className="mt-8" handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide} prevBtnText="previous" nextBtnText="next"/>
    </div>);
};
exports.default = OnboardingInstructions;
