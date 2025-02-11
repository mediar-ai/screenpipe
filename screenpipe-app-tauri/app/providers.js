"use strict";
// app/providers.tsx
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Providers = void 0;
const posthog_js_1 = __importDefault(require("posthog-js"));
const react_1 = require("posthog-js/react");
const react_2 = require("react");
const use_onboarding_1 = require("@/lib/hooks/use-onboarding");
const use_changelog_dialog_1 = require("@/lib/hooks/use-changelog-dialog");
const react_3 = require("react");
const use_settings_1 = require("@/lib/hooks/use-settings");
const use_profiles_1 = require("@/lib/hooks/use-profiles");
exports.Providers = (0, react_3.forwardRef)(({ children }, ref) => {
    (0, react_2.useEffect)(() => {
        if (typeof window !== "undefined") {
            const isDebug = process.env.TAURI_ENV_DEBUG === "true";
            if (isDebug)
                return;
            posthog_js_1.default.init("phc_Bt8GoTBPgkCpDrbaIZzJIEYt0CrJjhBiuLaBck1clce", {
                api_host: "https://eu.i.posthog.com",
                person_profiles: "identified_only",
                capture_pageview: false,
            });
        }
    }, []);
    return (<use_settings_1.store.Provider>
      <use_profiles_1.profilesStore.Provider>
        <use_onboarding_1.OnboardingProvider>
          <use_changelog_dialog_1.ChangelogDialogProvider>
            <react_1.PostHogProvider client={posthog_js_1.default}>{children}</react_1.PostHogProvider>
          </use_changelog_dialog_1.ChangelogDialogProvider>
        </use_onboarding_1.OnboardingProvider>
      </use_profiles_1.profilesStore.Provider>
    </use_settings_1.store.Provider>);
});
exports.Providers.displayName = "Providers";
