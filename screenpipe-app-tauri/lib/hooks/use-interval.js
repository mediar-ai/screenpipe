"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useInterval = useInterval;
const react_1 = require("react");
function useInterval(callback, delay) {
    const savedCallback = (0, react_1.useRef)(callback);
    (0, react_1.useEffect)(() => {
        savedCallback.current = callback;
    }, [callback]);
    (0, react_1.useEffect)(() => {
        if (delay !== null) {
            const id = setInterval(() => savedCallback.current(), delay);
            return () => clearInterval(id);
        }
    }, [delay]);
}
