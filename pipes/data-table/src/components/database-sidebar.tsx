"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Database } from "lucide-react"
import { JSX } from "react"

interface TableItem {
  name: string
  icon: JSX.Element
}

const tables: TableItem[] = [
  { name: "ui_monitoring", icon: <Database className="h-4 w-4" /> },
  { name: "video_chunks", icon: <Database className="h-4 w-4" /> },
  { name: "ocr_text", icon: <Database className="h-4 w-4" /> },
  { name: "audio_transcriptions", icon: <Database className="h-4 w-4" /> },
]

interface DatabaseSidebarProps {
  currentTable: string
  onTableSelect: (table: string) => void
}

export function DatabaseSidebar({ currentTable, onTableSelect }: DatabaseSidebarProps) {
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
                <span className="ml-2">{table.name}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}