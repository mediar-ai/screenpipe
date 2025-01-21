"use client";

import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function ReloadButton() {
  const router = useRouter();

  const handleReload = () => {
    console.log("performing full app reload...");
    // First refresh the Next.js router cache
    router.refresh();
    // Then do a hard reload
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleReload}
        className="hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <RotateCw className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground">if button does not work, right click to Reload</span>
    </div>
  );
}