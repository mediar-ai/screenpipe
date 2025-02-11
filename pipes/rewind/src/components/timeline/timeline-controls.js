"use strict";
"use client";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineControls = TimelineControls;
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const date_fns_1 = require("date-fns");
const utils_1 = require("@/lib/utils");
const framer_motion_1 = require("framer-motion");
const react_1 = require("react");
function TimelineControls({ startAndEndDates, currentDate, onDateChange, onJumpToday, className, }) {
    const jumpDay = (days) => __awaiter(this, void 0, void 0, function* () {
        const today = new Date();
        const newDate = (0, date_fns_1.endOfDay)(new Date(currentDate));
        newDate.setDate(newDate.getDate() + days);
        // Prevent jumping to future dates
        if ((0, date_fns_1.isAfter)((0, date_fns_1.startOfDay)(newDate), (0, date_fns_1.startOfDay)(today))) {
            yield onDateChange(today);
            return;
        }
        yield onDateChange(newDate);
    });
    // Disable forward button if we're at today
    const isAtToday = (0, react_1.useMemo)(() => !(0, date_fns_1.isAfter)((0, date_fns_1.startOfDay)(new Date()), (0, date_fns_1.startOfDay)(currentDate)), [currentDate]);
    const canGoBack = (0, react_1.useMemo)(() => (0, date_fns_1.isAfter)((0, date_fns_1.startOfDay)(startAndEndDates.start), (0, date_fns_1.startOfDay)((0, date_fns_1.subDays)(currentDate, 1))), [startAndEndDates.start, currentDate]);
    return (<div className={(0, utils_1.cn)("flex items-center gap-2 p-2 bg-muted/50 rounded-md", className)}>
			<button_1.Button variant="ghost" size="icon" onClick={() => jumpDay(-1)} className="h-8 w-8" disabled={canGoBack}>
				<lucide_react_1.ChevronLeft className="h-4 w-4"/>
			</button_1.Button>

			<framer_motion_1.AnimatePresence mode="wait">
				<framer_motion_1.motion.div key={currentDate.toISOString()} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            duration: 0.2,
        }} className="bg-background border rounded px-3 py-1 text-sm font-mono">
					{(0, date_fns_1.format)(currentDate, "d MMM yyyy")}
				</framer_motion_1.motion.div>
			</framer_motion_1.AnimatePresence>

			<button_1.Button variant="ghost" size="icon" onClick={() => jumpDay(1)} className="h-8 w-8" disabled={isAtToday}>
				<lucide_react_1.ChevronRight className="h-4 w-4"/>
			</button_1.Button>

			<div className="h-4 w-px bg-border mx-2"/>

			<button_1.Button variant="ghost" size="icon" onClick={onJumpToday} className="h-8 w-8" disabled={isAtToday}>
				<lucide_react_1.RefreshCw className="h-4 w-4"/>
			</button_1.Button>
		</div>);
}
