"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextUsageIndicator = ContextUsageIndicator;
const react_1 = __importDefault(require("react"));
const framer_motion_1 = require("framer-motion");
const lucide_react_1 = require("lucide-react");
function ContextUsageIndicator({ currentSize, maxSize, }) {
    const percentage = Math.min((currentSize / maxSize) * 100, 100);
    const circumference = 2 * Math.PI * 14;
    return (<div className="w-8 h-8 relative">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="none" stroke="#e2e8f0" strokeWidth="2"/>
        <framer_motion_1.motion.circle cx="16" cy="16" r="14" fill="none" stroke="black" strokeWidth="2" strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: circumference - (percentage / 100) * circumference }} transition={{ duration: 0.5 }}/>
      </svg>
      {percentage > 90 && (<lucide_react_1.AlertTriangle className="w-5 h-5 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-red-500"/>)}
    </div>);
}
