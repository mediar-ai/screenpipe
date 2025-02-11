"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Page;
const notion_settings_1 = require("@/components/notion-settings");
function Page() {
    return (<div className="flex flex-col gap-4 items-center justify-center h-full mt-12">
			<p className="text-xl font-bold">Your knowledge base on autopilot</p>
			<notion_settings_1.NotionSettings />
		</div>);
}
