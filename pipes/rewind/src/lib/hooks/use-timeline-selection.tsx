import { createContext, useContext, useState, ReactNode } from "react";

interface TimelineSelection {
	start: Date;
	end: Date;
	frameIds: string[];
}

interface TimelineContextType {
	selectionRange: TimelineSelection | null;
	setSelectionRange: (range: TimelineSelection | null) => void;
}

const TimelineContext = createContext<TimelineContextType | null>(null);

export function TimelineProvider({ children }: { children: ReactNode }) {
	const [selectionRange, setSelectionRange] =
		useState<TimelineSelection | null>(null);

	return (
		<TimelineContext.Provider value={{ selectionRange, setSelectionRange }}>
			{children}
		</TimelineContext.Provider>
	);
}

export function useTimelineSelection() {
	const context = useContext(TimelineContext);
	if (!context) {
		throw new Error(
			"useTimelineSelection must be used within a TimelineProvider",
		);
	}
	return context;
}
