"use client";

import { SearchChat } from "@/components/search-chat";
import { useSearchHistory } from "@/lib/hooks/use-search-history";

export default function SearchPage() {
  const {
    searches,
    currentSearchId,
    setCurrentSearchId,
    addSearch,
    deleteSearch,
    isCollapsed,
    toggleCollapse,
  } = useSearchHistory();
  return (
    <div className="flex flex-col gap-4 items-center justify-center h-full mt-12">
      <p className="text-xl font-bold">where pixels become magic</p>
      <SearchChat
        currentSearchId={currentSearchId}
        setCurrentSearchId={setCurrentSearchId}
        onAddSearch={addSearch}
        searches={searches}
      />
    </div>
  );
}
