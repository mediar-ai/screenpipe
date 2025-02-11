"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReloadButton = ReloadButton;
const button_1 = require("@/components/ui/button");
const lucide_react_1 = require("lucide-react");
const navigation_1 = require("next/navigation");
function ReloadButton() {
    const router = (0, navigation_1.useRouter)();
    const handleReload = () => {
        console.log("performing full app reload...");
        // First refresh the Next.js router cache
        router.refresh();
        // Then do a hard reload
        window.location.reload();
    };
    return (<div className="flex items-center gap-1">
      <button_1.Button variant="ghost" size="icon" onClick={handleReload} className="hover:bg-gray-100 dark:hover:bg-gray-800">
        <lucide_react_1.RotateCw className="h-4 w-4"/>
      </button_1.Button>
      <span className="text-sm text-muted-foreground">if button does not work, right click to Reload</span>
    </div>);
}
