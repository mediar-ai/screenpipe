"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
const react_1 = require("react");
const launch_linkedin_chrome_session_1 = require("@/components/launch-linkedin-chrome-session");
// import { IntroRequester } from "@/components/intro-requester";
const reload_button_1 = require("@/components/reload-button");
const harvest_1 = require("@/components/harvest");
function Home() {
    const [loginStatus, setLoginStatus] = (0, react_1.useState)(null);
    return (<div className="min-h-screen w-full p-4 pb-20 sm:p-8">
      <div className="space-y-1.5 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">linkedin ai assistant</h1>
        <p className="text-sm text-muted-foreground">automate your linkedin interactions with ai</p>
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">getting started</h2>
            <launch_linkedin_chrome_session_1.LaunchLinkedInChromeSession loginStatus={loginStatus} setLoginStatus={setLoginStatus}/>
            <reload_button_1.ReloadButton />
          </div>
        </section>

        {loginStatus === 'logged_in' && (<section>
            <h2 className="text-xl font-semibold mb-4">available workflows</h2>
            <div className="grid gap-4">
              <div className="border rounded-lg p-4">
                <harvest_1.HarvestClosestConnections />
              </div>

              {/* <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-4">
                send introduction requests to your network based on your criteria
              </p>
              <IntroRequester />
            </div> */}
            </div>
          </section>)}
      </div>
    </div>);
}
