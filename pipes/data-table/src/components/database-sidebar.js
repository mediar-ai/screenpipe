"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseSidebar = DatabaseSidebar;
const button_1 = require("@/components/ui/button");
const utils_1 = require("@/lib/utils");
const lucide_react_1 = require("lucide-react");
const tables = [
    {
        name: "ui_monitoring",
        displayName: "UI monitoring",
        icon: <lucide_react_1.Database className="h-4 w-4"/>,
    },
    {
        name: "video_chunks",
        displayName: "Video chunks",
        icon: <lucide_react_1.Database className="h-4 w-4"/>,
    },
    {
        name: "ocr_text",
        displayName: "OCR text",
        icon: <lucide_react_1.Database className="h-4 w-4"/>,
    },
    {
        name: "audio_transcriptions",
        displayName: "Audio transcriptions",
        icon: <lucide_react_1.Database className="h-4 w-4"/>,
    },
];
function DatabaseSidebar({ currentTable, onTableSelect, }) {
    return (<div className="pb-12 w-64 border-r">
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-lg font-semibold">database tables</h2>
          <div className="space-y-1">
            {tables.map((table) => (<button_1.Button key={table.name} variant={currentTable === table.name ? "secondary" : "ghost"} className={(0, utils_1.cn)("w-full justify-start", currentTable === table.name && "bg-muted")} onClick={() => onTableSelect(table.name)}>
                {table.icon}
                <span className="ml-2">{table.displayName}</span>
              </button_1.Button>))}
          </div>
        </div>
      </div>
    </div>);
}
