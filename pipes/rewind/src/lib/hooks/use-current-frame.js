"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCurrentFrame = void 0;
const react_1 = require("react");
const use_timeline_store_1 = require("./use-timeline-store");
const useCurrentFrame = (setCurrentIndex) => {
    const [currentFrame, setCurrentFrame] = (0, react_1.useState)(null);
    const { frames, isLoading } = (0, use_timeline_store_1.useTimelineStore)();
    const lastFramesLen = (0, react_1.useRef)(0);
    (0, react_1.useEffect)(() => {
        if (!currentFrame && frames.length) {
            setCurrentFrame(frames[lastFramesLen.current]);
            setCurrentIndex(lastFramesLen.current);
        }
        lastFramesLen.current = frames.length;
    }, [isLoading, frames]);
    return {
        currentFrame,
        setCurrentFrame,
    };
};
exports.useCurrentFrame = useCurrentFrame;
