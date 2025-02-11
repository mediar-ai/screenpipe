"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTimelineData = useTimelineData;
const use_timeline_store_1 = require("./use-timeline-store");
const react_1 = require("react");
function useTimelineData(currentDate, setCurFrame) {
    const { frames, isLoading, error, message, connectWebSocket, fetchTimeRange, fetchNextDayData, websocket, } = (0, use_timeline_store_1.useTimelineStore)();
    (0, react_1.useEffect)(() => {
        // First establish WebSocket connection
        connectWebSocket();
    }, []); // Only connect once when component mounts
    (0, react_1.useEffect)(() => {
        // Only fetch data when WebSocket is connected
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const startTime = new Date(currentDate);
            startTime.setHours(0, 0, 0, 0);
            const endTime = new Date(currentDate);
            if (endTime.getDate() === new Date().getDate()) {
                endTime.setMinutes(endTime.getMinutes() - 5);
            }
            else {
                endTime.setHours(23, 59, 59, 999);
            }
            fetchTimeRange(startTime, endTime);
            // Set initial frame if available
            if (frames.length > 0) {
                setCurFrame(frames[0]);
            }
        }
    }, [websocket === null || websocket === void 0 ? void 0 : websocket.readyState]); // Depend on WebSocket connection state
    return {
        frames,
        isLoading,
        error,
        message,
        fetchNextDayData,
    };
}
