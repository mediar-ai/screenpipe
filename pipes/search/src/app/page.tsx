// "use client";

import { SearchChat } from "@/components/search-chat";

export default function SearchPage() {

  return (
    <div className="flex flex-col gap-4 items-center justify-center h-full mt-12">
      <p className="text-xl font-bold">where pixels become magic</p>
      <SearchChat />
    </div>
  );
}
