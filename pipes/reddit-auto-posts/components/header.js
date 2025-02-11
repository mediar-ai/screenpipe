"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Header;
const alert_1 = require("@/components/ui/alert");
const use_settings_1 = require("@/lib/hooks/use-settings");
const lucide_react_1 = require("lucide-react");
function Header() {
    const { settings } = (0, use_settings_1.useSettings)();
    const aiDisabled = settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;
    return (<div className="flex flex-col justify-center items-center mt-2">
      {aiDisabled && (<alert_1.Alert className="w-[70%] shadow-sm">
          <lucide_react_1.Terminal className="h-4 w-4"/>
          <alert_1.AlertTitle>heads up!</alert_1.AlertTitle>
          <alert_1.AlertDescription className="text-muted-foreground">
            your ai provider is set to &apos;screenpipe-cloud&apos; and you don&apos;t have logged in <br />
            please login to use this pipe, go to app &gt; settings &gt; login
          </alert_1.AlertDescription>
        </alert_1.Alert>)}
      <div className="flex flex-col justify-center items-center">
        <img className="w-24 h-24" src="/128x128.png" alt="screenpipe-logo"/>
        <h1 className="font-bold text-center text-2xl">screenpipe</h1>
        <h1 className='font-medium text-lg text-center mt-1'>
          get reddit posts recommendation using your screenpipe data
        </h1>
      </div>
    </div>);
}
