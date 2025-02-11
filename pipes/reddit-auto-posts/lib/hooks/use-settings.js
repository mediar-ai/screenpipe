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
        // Optional: periodic refresh every 5s
        const interval = setInterval(loadSettings, 5000);
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
