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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateTimePicker = DateTimePicker;
const React = __importStar(require("react"));
const date_fns_1 = require("date-fns");
const lucide_react_1 = require("lucide-react");
const utils_1 = require("@/lib/utils");
const button_1 = require("@/components/ui/button");
const calendar_1 = require("@/components/ui/calendar");
const popover_1 = require("@/components/ui/popover");
const input_1 = require("./ui/input");
function DateTimePicker({ date, setDate, className, }) {
    const [selectedDateTime, setSelectedDateTime] = React.useState(date);
    React.useEffect(() => {
        setSelectedDateTime(date);
    }, [date]);
    const handleDateSelect = (selectedDate) => {
        if (selectedDate) {
            const newDateTime = new Date(selectedDateTime);
            newDateTime.setFullYear(selectedDate.getFullYear());
            newDateTime.setMonth(selectedDate.getMonth());
            newDateTime.setDate(selectedDate.getDate());
            setSelectedDateTime(newDateTime);
            setDate(newDateTime);
        }
    };
    const handleTimeChange = (event) => {
        const [hours, minutes] = event.target.value.split(":").map(Number);
        if (!isNaN(hours) && !isNaN(minutes)) {
            const newDateTime = new Date(selectedDateTime);
            newDateTime.setHours(hours);
            newDateTime.setMinutes(minutes);
            setSelectedDateTime(newDateTime);
            setDate(newDateTime);
        }
    };
    return (<popover_1.Popover>
      <popover_1.PopoverTrigger asChild>
        <button_1.Button variant={"outline"} className={(0, utils_1.cn)("w-full justify-start text-left font-normal")}>
          <lucide_react_1.Calendar className="mr-2 h-4 w-4 text-gray-400" size={18}/>
          {(0, date_fns_1.format)(date, "PPP HH:mm").toLowerCase()}
        </button_1.Button>
      </popover_1.PopoverTrigger>
      <popover_1.PopoverContent className={(0, utils_1.cn)("w-auto p-0", className)}>
        <calendar_1.Calendar mode="single" selected={selectedDateTime} onSelect={handleDateSelect} initialFocus/>
        <div className="p-3 border-t border-border">
          <input_1.Input type="time" onChange={handleTimeChange} value={(0, date_fns_1.format)(selectedDateTime, "HH:mm")}/>
        </div>
      </popover_1.PopoverContent>
    </popover_1.Popover>);
}
