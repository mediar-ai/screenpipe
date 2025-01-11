"use client";

import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";

export function ReloadButton() {
  const handleReload = () => {
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
      <span className="text-sm text-muted-foreground">sometimes you need to refresh page</span>
    </div>
  );
}