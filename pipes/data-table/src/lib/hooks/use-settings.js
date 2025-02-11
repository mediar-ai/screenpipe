"use strict";
"use client";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSettings = useSettings;
const react_1 = require("react");
const browser_1 = require("@screenpipe/browser");
function useSettings() {
    const defaultSettings = (0, browser_1.getDefaultSettings)();
    defaultSettings.customSettings = Object.assign(Object.assign({}, (defaultSettings.customSettings || {})), { obsidian: {
            prompt: `yo, you're my personal data detective! 🕵️‍♂️

rules for the investigation:
- extract names of people i interact with and what we discussed, when i encounter a person, make sure to extract their name like this [[John Doe]] so it's linked in my notes
- identify recurring topics/themes in my convos, use tags or [[Link them]] to my notes
- spot any promises or commitments made (by me or others)
- catch interesting ideas or insights dropped in casual chat
- note emotional vibes and energy levels in conversations
- highlight potential opportunities or connections
- track project progress and blockers mentioned

style rules:
- always put people's names in double square brackets, eg: [[John Doe]] to link to their notes, same for companies, eg: [[Google]], or projects, eg: [[Project X]]
- keep it real and conversational
- use bullet points for clarity
- include relevant timestamps
- group related info together
- max 4 lines per insight
- no corporate speak, keep it human
- for tags use hyphen between words, no spaces, eg: #my-tag not #my tag nor #myTag nor #my_tag

remember: you're analyzing screen ocr text & audio, etc. from my computer, so focus on actual interactions and content!
you'll get chunks of 5 mins roughly of data screen & audio recordings and have to write logs.
this data will be used later for analysis, it must contains valuable insights on what i am doing.
if you do your job well, i'll give you a 🍺 and $1m`,
        } });
    const [settings, setSettings] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const loadSettings = () => __awaiter(this, void 0, void 0, function* () {
            if (!loading)
                setLoading(true);
            try {
                const response = yield fetch("/api/settings");
                const data = yield response.json();
                setSettings(Object.assign(Object.assign({}, defaultSettings), data));
            }
            catch (err) {
                console.error("failed to load settings:", err);
                setSettings(defaultSettings);
                setError(err);
            }
            finally {
                setLoading(false);
            }
        });
        // Initial load
        loadSettings();
        // Refresh on window focus
        const onFocus = () => loadSettings();
        window.addEventListener("focus", onFocus);
        // Optional: periodic refresh every 30s
        const interval = setInterval(loadSettings, 2000);
        return () => {
            window.removeEventListener("focus", onFocus);
            clearInterval(interval);
        };
    }, []);
    const updateSetting = (key, value, namespace) => __awaiter(this, void 0, void 0, function* () {
        if (!settings)
            return;
        try {
            yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ key, value, namespace }),
            });
            if (namespace) {
                setSettings((prev) => {
                    var _a;
                    if (!prev)
                        return defaultSettings;
                    return Object.assign(Object.assign({}, prev), { customSettings: Object.assign(Object.assign({}, prev.customSettings), { [namespace]: Object.assign(Object.assign({}, (((_a = prev.customSettings) === null || _a === void 0 ? void 0 : _a[namespace]) || {})), { [key]: value }) }) });
                });
            }
            else {
                setSettings((prev) => {
                    if (!prev)
                        return defaultSettings;
                    return Object.assign(Object.assign({}, prev), { [key]: value });
                });
            }
        }
        catch (err) {
            setError(err);
        }
    });
    const updateSettings = (newSettings, namespace) => __awaiter(this, void 0, void 0, function* () {
        if (!settings)
            return;
        try {
            yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({
                    value: newSettings,
                    isPartialUpdate: true,
                    namespace,
                }),
            });
            if (namespace) {
                setSettings((prev) => {
                    var _a;
                    if (!prev)
                        return defaultSettings;
                    return Object.assign(Object.assign({}, prev), { customSettings: Object.assign(Object.assign({}, prev.customSettings), { [namespace]: Object.assign(Object.assign({}, (((_a = prev.customSettings) === null || _a === void 0 ? void 0 : _a[namespace]) || {})), newSettings) }) });
                });
            }
            else {
                setSettings((prev) => {
                    if (!prev)
                        return defaultSettings;
                    return Object.assign(Object.assign({}, prev), newSettings);
                });
            }
        }
        catch (err) {
            setError(err);
        }
    });
    const resetSettings = (settingKey, namespace) => __awaiter(this, void 0, void 0, function* () {
        if (!settings)
            return;
        try {
            yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ reset: true, key: settingKey, namespace }),
            });
            if (namespace) {
                setSettings((prev) => {
                    var _a;
                    if (!prev)
                        return defaultSettings;
                    if (settingKey) {
                        return Object.assign(Object.assign({}, prev), { customSettings: Object.assign(Object.assign({}, prev.customSettings), { [namespace]: Object.assign(Object.assign({}, (((_a = prev.customSettings) === null || _a === void 0 ? void 0 : _a[namespace]) || {})), { [settingKey]: undefined }) }) });
                    }
                    else {
                        return Object.assign(Object.assign({}, prev), { customSettings: Object.assign(Object.assign({}, prev.customSettings), { [namespace]: {} }) });
                    }
                });
            }
            else {
                if (settingKey) {
                    setSettings((prev) => {
                        if (!prev)
                            return defaultSettings;
                        return Object.assign(Object.assign({}, prev), { [settingKey]: defaultSettings[settingKey] });
                    });
                }
                else {
                    setSettings(defaultSettings);
                }
            }
        }
        catch (err) {
            setError(err);
        }
    });
    return {
        settings: settings || defaultSettings,
        loading,
        error,
        updateSetting,
        updateSettings,
        resetSettings,
    };
}
