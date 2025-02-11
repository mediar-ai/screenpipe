"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const card_1 = require("@/components/ui/card");
const lucide_react_1 = require("lucide-react");
const dialog_1 = require("@/components/ui/dialog");
const navigation_1 = __importDefault(require("@/components/onboarding/navigation"));
const PERSONALIZATION_OPTIONS = [
    {
        key: "withoutAI",
        icon: lucide_react_1.TextSearch,
        title: "conventional search",
        description: "use advanced search capabilities on top of your 24/7 recordings or the pipe store",
        note: "no api key needed.",
    },
    {
        key: "withAI",
        icon: lucide_react_1.BotMessageSquare,
        title: "ai-enhanced Search",
        description: "use ai capabilities to summarize your recordings, extract insights, or use meeting summaries.",
        note: "api key required.",
    },
];
const CardItem = ({ option, isSelected, onClick }) => {
    const { icon: Icon, title, description, note } = option;
    return (<div className="relative group h-[270px]">
      <div className={`absolute h-full !mt-[-5px] inset-0 rounded-lg transition-all duration-300 ease-out group-hover:before:opacity-100 group-hover:before:scale-100 
        before:absolute before:inset-0 before:rounded-lg before:border-2 before:border-black dark:before:border-white before:opacity-0 before:scale-95 before:transition-all 
        before:duration-300 before:ease-out ${isSelected ? "before:!border-none" : ""}`}/>
      <card_1.Card className={`p-4 h-full !mt-[-5px] cursor-pointer bg-white dark:bg-gray-800 hover:bg-accent transition-all relative z-[1] duration-300 ease-out group-hover:scale-[0.98]
        ${isSelected
            ? "bg-accent transition-transform relative border-2 border-black dark:border-white"
            : ""}`} onClick={onClick}>
        <card_1.CardContent className="flex flex-col w-[250px] justify-center">
          <Icon className="w-16 h-16 mx-auto"/>
          <h2 className="font-semibold text-xl text-center mt-1">{title}</h2>
          <span className="prose prose-sm mt-1">{description}</span>
          <span className="text-muted-foreground text-center prose-sm mt-4">
            {note}
          </span>
        </card_1.CardContent>
      </card_1.Card>
    </div>);
};
const OnboardingPersonalize = ({ className = "", selectedPersonalization = "", handleOptionClick, handleNextSlide, handlePrevSlide, }) => {
    return (<div className={`${className} w-full flex justify-center flex-col relative`}>
      <dialog_1.DialogHeader className="flex flex-col px-2 justify-center items-center">
        <img className="w-24 h-24 justify-center" src="/128x128.png" alt="screenpipe-logo"/>
        <dialog_1.DialogTitle className="text-center text-2xl">
          do you want to use AI or just plain search?
        </dialog_1.DialogTitle>
      </dialog_1.DialogHeader>
      <div className="flex w-full justify-around mt-6">
        {PERSONALIZATION_OPTIONS.map((option) => (<CardItem key={option.key} option={option} isSelected={selectedPersonalization === option.key} onClick={() => handleOptionClick(option.key)}/>))}
      </div>
      <navigation_1.default className="mt-9" handlePrevSlide={handlePrevSlide} handleNextSlide={handleNextSlide} prevBtnText="previous" nextBtnText="next"/>
    </div>);
};
exports.default = OnboardingPersonalize;
