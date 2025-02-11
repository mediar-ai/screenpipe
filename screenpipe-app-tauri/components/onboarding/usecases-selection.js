"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const dialog_1 = require("@/components/ui/dialog");
const lucide_react_1 = require("lucide-react");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const posthog_js_1 = __importDefault(require("posthog-js"));
const OPTIONS = [
    {
        key: "personalUse",
        icon: lucide_react_1.UserRound,
        label: "personal use",
        description: "personal knowledge management, productivity, custom dev, etc.",
    },
    {
        key: "professionalUse",
        icon: lucide_react_1.BriefcaseBusiness,
        label: "professional use",
        description: "out of the box productivity, meeting summaries, automation, etc.",
    },
    {
        key: "developmentlUse",
        icon: lucide_react_1.Wrench,
        label: "development purpose",
        description: "integrate in your business product, build on top, resell, etc.",
    },
    {
        key: "otherUse",
        icon: lucide_react_1.SlidersHorizontal,
        label: "other",
        description: "", // TODO editable
    },
];
const SelectionItem = ({ option, isSelected, onClick }) => {
    const { icon: Icon, label, description } = option;
    return (<div className={`w-[90%] flex items-center border prose prose-sm rounded-lg m-[10px] px-4 py-[10px] hover:bg-accent cursor-pointer
        ${isSelected
            ? "bg-primary text-primary-foreground transition duration-300 hover:bg-primary/90"
            : ""}`} onClick={onClick}>
      <span className="float-left">
        <Icon className="inline h-4 w-4 mr-2"/>
        {label}{" "}
        {description && <span className="text-[12px]">({description})</span>}
      </span>
      {isSelected && <lucide_react_1.CircleCheck className="inline h-4 w-4 ml-auto"/>}
    </div>);
};
const OnboardingSelection = ({ className, selectedOptions, handleOptionClick, handleNextSlide, handlePrevSlide, }) => {
    const handleNext = () => {
        // Track selected options in Posthog
        posthog_js_1.default.capture("onboarding_usecases_selected", {
            selected_options: selectedOptions,
        });
        // Call the original handleNextSlide function
        handleNextSlide();
    };
    return (<div className={`${className} flex flex-col h-full`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          what are you planning to use the screenpipe for?
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>

      <div className="flex relative mt-8 justify-center items-center flex-col">
        <span className="text-[15px] w-full text-center text-muted-foreground mb-2">
          you can select multiple options:
        </span>
        {OPTIONS.map((option) => (<SelectionItem key={option.key} option={option} isSelected={selectedOptions === null || selectedOptions === void 0 ? void 0 : selectedOptions.includes(option.key)} onClick={() => handleOptionClick(option.key)}/>))}
      </div>
      <navigation_1.default handlePrevSlide={handlePrevSlide} handleNextSlide={handleNext} prevBtnText="previous" nextBtnText="next"/>
    </div>);
};
exports.default = OnboardingSelection;
