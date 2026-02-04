import { create } from "zustand";
import { ReactNode } from "react";

interface TimelineSelection {
	start: Date;
	end: Date;
	frameIds: string[];
}

interface TimelineSelectionStore {
	selectionRange: TimelineSelection | null;
	setSelectionRange: (range: TimelineSelection | null) => void;
}

export const useTimelineSelection = create<TimelineSelectionStore>((set) => ({
	selectionRange: null,
	setSelectionRange: (range) => set({ selectionRange: range }),
}));

// Keep the provider for backwards compatibility, but it's now a no-op wrapper
export function TimelineProvider({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
