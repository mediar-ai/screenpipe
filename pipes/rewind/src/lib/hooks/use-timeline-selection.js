"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineProvider = TimelineProvider;
exports.useTimelineSelection = useTimelineSelection;
const react_1 = require("react");
const TimelineContext = (0, react_1.createContext)(undefined);
function TimelineProvider({ children }) {
    const [selectionRange, setSelectionRange] = (0, react_1.useState)(null);
    return (<TimelineContext.Provider value={{ selectionRange, setSelectionRange }}>
      {children}
    </TimelineContext.Provider>);
}
function useTimelineSelection() {
    const context = (0, react_1.useContext)(TimelineContext);
    if (!context) {
        throw new Error("useTimelineSelection must be used within a TimelineProvider");
    }
    return context;
}
