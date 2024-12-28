import { createContext, useContext, ReactNode, useState } from "react";

interface TimelineContextType {
  selectionRange: { start: Date; end: Date } | null;
  setSelectionRange: (range: { start: Date; end: Date } | null) => void;
}

const TimelineContext = createContext<TimelineContextType | undefined>(
  undefined
);

export function TimelineProvider({ children }: { children: ReactNode }) {
  const [selectionRange, setSelectionRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

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
      "useTimelineSelection must be used within a TimelineProvider"
    );
  }
  return context;
}
