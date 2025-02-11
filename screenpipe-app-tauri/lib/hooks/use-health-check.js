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
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const healthRef = (0, react_1.useRef)(health);
    const wsRef = (0, react_1.useRef)(null);
    const previousHealthStatus = (0, react_1.useRef)(null);
    const unhealthyTransitionsRef = (0, react_1.useRef)(0);
    const retryIntervalRef = (0, react_1.useRef)(null);
    const fetchHealth = (0, react_1.useCallback)(() => __awaiter(this, void 0, void 0, function* () {
        if (wsRef.current) {
            wsRef.current.close();
        }
        const ws = new WebSocket("ws://127.0.0.1:3030/ws/health");
        wsRef.current = ws;
        ws.onopen = () => {
            setIsLoading(false);
            if (retryIntervalRef.current) {
                clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = null;
            }
        };
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (isHealthChanged(healthRef.current, data)) {
                setHealth(data);
                healthRef.current = data;
            }
            if (data.status === "unhealthy" &&
                previousHealthStatus.current === "healthy") {
                unhealthyTransitionsRef.current += 1;
            }
            previousHealthStatus.current = data.status;
        };
        ws.onerror = (event) => {
            const error = event;
            const errorHealth = {
                status: "error",
                status_code: 500,
                last_frame_timestamp: null,
                last_audio_timestamp: null,
                last_ui_timestamp: null,
                frame_status: "error",
                audio_status: "error",
                ui_status: "error",
                message: error.message,
            };
            setHealth(errorHealth);
            setIsServerDown(true);
            setIsLoading(false);
            if (!retryIntervalRef.current) {
                retryIntervalRef.current = setInterval(fetchHealth, 2000);
            }
        };
        ws.onclose = () => {
            const errorHealth = {
                status: "error",
                status_code: 500,
                last_frame_timestamp: null,
                last_audio_timestamp: null,
                last_ui_timestamp: null,
                frame_status: "error",
                audio_status: "error",
                ui_status: "error",
                message: "WebSocket connection closed",
            };
            setHealth(errorHealth);
            setIsServerDown(true);
            if (!retryIntervalRef.current) {
                retryIntervalRef.current = setInterval(fetchHealth, 2000);
            }
        };
    }), []);
    const debouncedFetchHealth = (0, react_1.useCallback)(() => {
        return new Promise((resolve) => {
            (0, lodash_1.debounce)(() => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    fetchHealth().then(resolve);
                }
                else {
                    resolve();
                }
            }, 1000)();
        });
    }, [fetchHealth]);
    (0, react_1.useEffect)(() => {
        fetchHealth();
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (retryIntervalRef.current) {
                clearInterval(retryIntervalRef.current);
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
