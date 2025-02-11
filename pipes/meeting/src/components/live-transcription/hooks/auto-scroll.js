"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAutoScroll = useAutoScroll;
const react_1 = require("react");
// Accept any array type since we only care about length changes
function useAutoScroll(items) {
    const scrollRef = (0, react_1.useRef)(null);
    const [shouldAutoScroll, setShouldAutoScroll] = (0, react_1.useState)(true);
    const lastStateRef = (0, react_1.useRef)(true);
    const scrollToBottom = () => {
        const element = scrollRef.current;
        if (!element) {
            // console.log('no scroll element found')
            return;
        }
        // Use requestAnimationFrame to ensure content is rendered
        requestAnimationFrame(() => {
            element.scrollTo({
                top: element.scrollHeight,
                behavior: 'smooth'
            });
        });
    };
    // Handle scroll events
    const onScroll = () => {
        const element = scrollRef.current;
        if (!element)
            return;
        const isAtBottom = Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 50;
        if (isAtBottom !== lastStateRef.current) {
            console.log('auto-scroll:', isAtBottom ? 'enabled' : 'disabled');
            lastStateRef.current = isAtBottom;
        }
        setShouldAutoScroll(isAtBottom);
    };
    // Auto-scroll when new chunks arrive
    (0, react_1.useEffect)(() => {
        if (shouldAutoScroll) {
            scrollToBottom();
        }
    }, [items, shouldAutoScroll]);
    return { scrollRef, onScroll, isScrolledToBottom: shouldAutoScroll };
}
