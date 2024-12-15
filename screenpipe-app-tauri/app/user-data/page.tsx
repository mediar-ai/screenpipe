"use client";

import DataPage from "@/components/user-data/page";

export default function UserDataPage() {

  return (
    <div className="flex flex-col gap-4 items-center justify-center h-full mt-12">
      <p className="text-xl font-bold">where pixels become magic</p>
      <DataPage />
    </div>
  );
}
