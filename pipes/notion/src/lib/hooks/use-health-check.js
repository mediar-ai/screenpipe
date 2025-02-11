"use strict";
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
exports.useHealthCheck = useHealthCheck;
const react_1 = require("react");
const lodash_1 = require("lodash");
function isHealthChanged(oldHealth, newHealth) {
    if (!oldHealth)
        return true;
    return (oldHealth.status !== newHealth.status ||
        oldHealth.status_code !== newHealth.status_code ||
        oldHealth.last_frame_timestamp !== newHealth.last_frame_timestamp ||
        oldHealth.last_audio_timestamp !== newHealth.last_audio_timestamp ||
        oldHealth.last_ui_timestamp !== newHealth.last_ui_timestamp ||
        oldHealth.frame_status !== newHealth.frame_status ||
        oldHealth.audio_status !== newHealth.audio_status ||
        oldHealth.ui_status !== newHealth.ui_status ||
        oldHealth.message !== newHealth.message);
}
function useHealthCheck() {
    const [health, setHealth] = (0, react_1.useState)(null);
    const [isServerDown, setIsServerDown] = (0, react_1.useState)(false);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const abortControllerRef = (0, react_1.useRef)(null);
    const healthRef = (0, react_1.useRef)(health);
    const fetchHealth = (0, react_1.useCallback)(() => __awaiter(this, void 0, void 0, function* () {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        try {
            setIsLoading(true);
            const response = yield fetch("http://localhost:3030/health", {
                cache: "no-store",
                signal: abortControllerRef.current.signal,
                headers: {
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache",
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = yield response.json();
            if (isHealthChanged(healthRef.current, data)) {
                setHealth(data);
                healthRef.current = data;
            }
            setIsServerDown(false);
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                return;
            }
            // console.error("Health check error:", error);
            if (!isServerDown) {
                setIsServerDown(true);
                const errorHealth = {
                    last_frame_timestamp: null,
                    last_audio_timestamp: null,
                    last_ui_timestamp: null,
                    frame_status: "error",
                    audio_status: "error",
                    ui_status: "error",
                    status: "error",
                    status_code: 500,
                    message: "Failed to fetch health status. Server might be down.",
                };
                setHealth(errorHealth);
                healthRef.current = errorHealth;
            }
        }
        finally {
            setIsLoading(false);
        }
    }), [isServerDown, setIsLoading]);
    const debouncedFetchHealth = (0, react_1.useCallback)((0, lodash_1.debounce)(fetchHealth, 200), [
        fetchHealth,
    ]);
    (0, react_1.useEffect)(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 1000);
        return () => {
            clearInterval(interval);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchHealth]);
    return {
        health,
        isServerDown,
        isLoading,
        fetchHealth,
        debouncedFetchHealth,
    };
}
