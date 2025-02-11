"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react"); // Importing icons
const OnboardingNavigation = ({ nextBtnText = "", prevBtnText = "", className = "", isLoading, handlePrevSlide, handleNextSlide, }) => {
    return (<div className={`flex justify-between items-center mx-auto ${className} fixed bottom-0 left-20 right-20 p-4 bg-transparent max-w-screen-lg`}>
      <button_1.Button className="flex items-center w-fit min-w-32 disabled:!cursor-not-allowed disabled:!pointer-events-auto" variant={"outline"} onClick={handlePrevSlide} disabled={isLoading}>
        <lucide_react_1.ArrowLeft className="mr-2"/> {/* Icon with margin */}
        {prevBtnText}
      </button_1.Button>
      <button_1.Button className="flex items-center w-fit min-w-32 disabled:!cursor-not-allowed disabled:!pointer-events-auto" onClick={handleNextSlide} disabled={isLoading}>
        {nextBtnText}
        <lucide_react_1.ArrowRight className="ml-2"/> {/* Icon with margin */}
      </button_1.Button>
    </div>);
};
exports.default = OnboardingNavigation;
