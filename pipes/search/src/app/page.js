"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SearchPage;
const alert_1 = require("@/components/ui/alert");
const use_settings_1 = require("@/lib/hooks/use-settings");
const lucide_react_1 = require("lucide-react");
const search_chat_1 = require("@/components/search-chat");
function SearchPage() {
    const { settings } = (0, use_settings_1.useSettings)();
    const aiDisabled = settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;
    return (<div className={`flex flex-col gap-4 items-center justify-center h-full ${aiDisabled ? "mt-2" : "mt-12"}`}>
      {aiDisabled && (<alert_1.Alert className="w-[70%] shadow-sm">
          <lucide_react_1.Terminal className="h-4 w-4"/>
          <alert_1.AlertTitle>heads up!</alert_1.AlertTitle>
          <alert_1.AlertDescription className="text-muted-foreground">
            your ai provider is set to &apos;screenpipe-cloud&apos; and you don&apos;t have logged in <br />
            please login to use this pipe, go to app &gt; settings &gt; login
          </alert_1.AlertDescription>
        </alert_1.Alert>)}
      <p className="text-2xl font-bold">where pixels become magic</p>
      <search_chat_1.SearchChat />
    </div>);
}
