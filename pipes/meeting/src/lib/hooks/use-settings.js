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
exports.SettingsProvider = SettingsProvider;
exports.useSettings = useSettings;
const react_1 = require("react");
const browser_1 = require("@screenpipe/browser");
const SettingsContext = (0, react_1.createContext)(null);
function SettingsProvider({ children }) {
    const defaultSettings = (0, browser_1.getDefaultSettings)();
    // Hardcode the token in the initial settings
    const initialSettings = Object.assign(Object.assign({}, defaultSettings), { aiProviderType: "screenpipe-cloud", user: Object.assign(Object.assign({}, defaultSettings.user), { token: "eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDIyMkFBQSIsImtpZCI6Imluc18ycGFFR0Jxc0dEYTZXcVlyaEFySjdtS0o0elYiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL3NjcmVlbnBpLnBlIiwiZXhwIjoyMDU0MzI2MDkyLCJpYXQiOjE3Mzg5NjYwOTIsImlzcyI6Imh0dHBzOi8vY2xlcmsuc2NyZWVucGkucGUiLCJqdGkiOiI3NzkxM2JlYTQxNGUxZGEyOGYyNCIsIm5iZiI6MTczODk2NjA4Nywic3ViIjoidXNlcl8yc2pQYjhlTEwyVTNTWU9TZDZkZnVsdUdrZlIifQ.FUNvk3iJVZa9JP1aq-qa6ta9DvtvW1piiUE5AQA7RydDHCkHPzQedPriLBuVKaZt9bLlPmdLOv2vK-qsB1bgVzSXUFXiPSC-OdySH7Do3WLQIEz-9YX4J-LaC8FSrOkvxjWch6uTev0k2-gdOyhClOOGpKR3qIHPDRy5eftZpw0Mc3cGmJp4AjWIAKllBKoa3F0DGN0WIUBM1GwpPw5e1nTJ3F9BDFf_dNwJmQ5MWCFXJXjC9mX4K0xbT3AkWJqQdXopP2wZlnAWwLyURWbWthZEqMCZEQQwCm5P7tW7GIAkWpiouHoaLT9C90YNYsI2j8EkPCbIPieDfncXXiWNQA" }), aiUrl: "https://ai-proxy.i-f9f.workers.dev/v1", aiModel: "gpt-4o", analyticsEnabled: true });
    const [settings, setSettings] = (0, react_1.useState)(initialSettings);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const loadSettings = () => __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            try {
                const response = yield fetch("/api/settings");
                if (!response.ok) {
                    console.log("using default settings (web mode)");
                    setSettings(initialSettings); // Use initialSettings instead of defaultSettings
                    return;
                }
                const data = yield response.json();
                // Preserve our hardcoded token when merging settings
                setSettings(Object.assign(Object.assign(Object.assign({}, initialSettings), data), { aiProviderType: "screenpipe-cloud", user: Object.assign(Object.assign(Object.assign({}, initialSettings.user), data.user), { token: initialSettings.user.token, clerk_id: initialSettings.user.clerk_id, id: initialSettings.user.id, email: initialSettings.user.email }), aiUrl: initialSettings.aiUrl, aiModel: initialSettings.aiModel }));
            }
            catch (err) {
                console.log("failed to load settings, using defaults:", err);
                setSettings(initialSettings); // Use initialSettings instead of defaultSettings
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
        const interval = setInterval(loadSettings, 30000);
        return () => {
            window.removeEventListener("focus", onFocus);
            clearInterval(interval);
        };
    }, []);
    const updateSetting = (key, value) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ key, value }),
            });
            if (!response.ok) {
                // For web users, just update state without persistence
                console.log("updating settings in memory only (web mode)");
                setSettings((prev) => (Object.assign(Object.assign({}, prev), { [key]: value })));
                return;
            }
            setSettings((prev) => (Object.assign(Object.assign({}, prev), { [key]: value })));
        }
        catch (err) {
            console.log("failed to update setting, updating in memory:", err);
            // Update state even if API fails
            setSettings((prev) => (Object.assign(Object.assign({}, prev), { [key]: value })));
        }
    });
    const updateSettings = (newSettings) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ value: newSettings, isPartialUpdate: true }),
            });
            if (!response.ok) {
                // For web users, just update state without persistence
                console.log("updating settings in memory only (web mode)");
                setSettings((prev) => (Object.assign(Object.assign({}, prev), newSettings)));
                return;
            }
            setSettings((prev) => (Object.assign(Object.assign({}, prev), newSettings)));
        }
        catch (err) {
            console.log("failed to update settings, updating in memory:", err);
            // Update state even if API fails
            setSettings((prev) => (Object.assign(Object.assign({}, prev), newSettings)));
        }
    });
    const resetSettings = (settingKey) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ reset: true, key: settingKey }),
            });
            if (!response.ok) {
                // For web users, just update state without persistence
                console.log("resetting settings in memory only (web mode)");
                if (settingKey) {
                    setSettings((prev) => (Object.assign(Object.assign({}, prev), { [settingKey]: defaultSettings[settingKey] })));
                }
                else {
                    setSettings(defaultSettings);
                }
                return;
            }
            if (settingKey) {
                setSettings((prev) => (Object.assign(Object.assign({}, prev), { [settingKey]: defaultSettings[settingKey] })));
            }
            else {
                setSettings(defaultSettings);
            }
        }
        catch (err) {
            console.log("failed to reset settings, updating in memory:", err);
            // Reset state even if API fails
            if (settingKey) {
                setSettings((prev) => (Object.assign(Object.assign({}, prev), { [settingKey]: defaultSettings[settingKey] })));
            }
            else {
                setSettings(defaultSettings);
            }
        }
    });
    const value = {
        settings,
        loading,
        error,
        updateSetting,
        updateSettings,
        resetSettings,
    };
    return (<SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>);
}
function useSettings() {
    const context = (0, react_1.useContext)(SettingsContext);
    if (!context) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
}
