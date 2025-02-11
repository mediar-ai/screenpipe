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
    const [settings, setSettings] = (0, react_1.useState)(defaultSettings);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const loadSettings = () => __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            try {
                const response = yield fetch("/api/settings");
                const data = yield response.json();
                setSettings(Object.assign(Object.assign({}, defaultSettings), data));
            }
            catch (err) {
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
        const interval = setInterval(loadSettings, 30000);
        return () => {
            window.removeEventListener("focus", onFocus);
            clearInterval(interval);
        };
    }, []);
    const updateSetting = (key, value) => __awaiter(this, void 0, void 0, function* () {
        try {
            yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ key, value }),
            });
            setSettings((prev) => (Object.assign(Object.assign({}, prev), { [key]: value })));
        }
        catch (err) {
            setError(err);
        }
    });
    const updateSettings = (newSettings) => __awaiter(this, void 0, void 0, function* () {
        try {
            yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ value: newSettings, isPartialUpdate: true }),
            });
            setSettings((prev) => (Object.assign(Object.assign({}, prev), newSettings)));
        }
        catch (err) {
            setError(err);
        }
    });
    const resetSettings = (settingKey) => __awaiter(this, void 0, void 0, function* () {
        try {
            yield fetch("/api/settings", {
                method: "PUT",
                body: JSON.stringify({ reset: true, key: settingKey }),
            });
            if (settingKey) {
                setSettings((prev) => (Object.assign(Object.assign({}, prev), { [settingKey]: defaultSettings[settingKey] })));
            }
            else {
                setSettings(defaultSettings);
            }
        }
        catch (err) {
            setError(err);
        }
    });
    return {
        settings,
        loading,
        error,
        updateSetting,
        updateSettings,
        resetSettings,
    };
}
