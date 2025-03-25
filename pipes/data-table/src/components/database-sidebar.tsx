"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Database } from "lucide-react";
import { JSX, useEffect, useState } from "react";

interface TableItem {
  name: string;
  displayName: string;
  icon: JSX.Element;
}

const allTables: TableItem[] = [
  {
    name: "ui_monitoring",
    displayName: "UI monitoring",
    icon: <Database className="h-4 w-4" />,
  },
  {
    name: "video_chunks",
    displayName: "Video files",
    icon: <Database className="h-4 w-4" />,
  },
  {
    name: "ocr_text",
    displayName: "OCR",
    icon: <Database className="h-4 w-4" />,
  },
  {
    name: "audio_transcriptions",
    displayName: "Audio transcriptions",
    icon: <Database className="h-4 w-4" />,
  },
];

interface DatabaseSidebarProps {
  currentTable: string;
  onTableSelect: (table: string) => void;
}

export function DatabaseSidebar({
  currentTable,
  onTableSelect,
}: DatabaseSidebarProps) {
  const [tables, setTables] = useState<TableItem[]>([]);

  useEffect(() => {
    // detect macos
    const isMacOS =
      navigator.platform.toUpperCase().indexOf("MAC") >= 0 ||
      /Mac/.test(navigator.userAgent);

    // filter tables based on os
    if (isMacOS) {
      setTables(allTables);
    } else {
      // exclude ui_monitoring on non-macos
      setTables(allTables.filter((table) => table.name !== "ui_monitoring"));
    }
  }, []);

  return (
    <div className="pb-12 w-64 border-r">
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-lg font-semibold">database tables</h2>
          <div className="space-y-1">
            {tables.map((table) => (
              <Button
                key={table.name}
                variant={currentTable === table.name ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  currentTable === table.name && "bg-muted"
                )}
                onClick={() => onTableSelect(table.name)}
              >
                {table.icon}
                <span className="ml-2">{table.displayName}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
