"use strict";
// "use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Page;
const obsidian_settings_1 = require("@/components/obsidian-settings");
function Page() {
    return (<div className="flex flex-col gap-4 items-center justify-center h-full mt-12">
      <p className="text-xl font-bold">Your knowledge base on autopilot</p>
      <obsidian_settings_1.ObsidianSettings />
    </div>);
}
