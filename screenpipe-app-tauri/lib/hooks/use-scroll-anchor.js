"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useScrollAnchor = void 0;
const react_1 = require("react");
const useScrollAnchor = () => {
    const messagesRef = (0, react_1.useRef)(null);
    const scrollRef = (0, react_1.useRef)(null);
    const visibilityRef = (0, react_1.useRef)(null);
    const [isAtBottom, setIsAtBottom] = (0, react_1.useState)(true);
    const [isVisible, setIsVisible] = (0, react_1.useState)(false);
    const scrollToBottom = (0, react_1.useCallback)(() => {
        if (messagesRef.current) {
            messagesRef.current.scrollIntoView({
                block: "end",
                behavior: "smooth",
            });
        }
    }, []);
    (0, react_1.useEffect)(() => {
        if (messagesRef.current) {
            if (isAtBottom && !isVisible) {
                messagesRef.current.scrollIntoView({
                    block: "end",
                });
            }
        }
    }, [isAtBottom, isVisible]);
    (0, react_1.useEffect)(() => {
        const { current } = scrollRef;
        if (current) {
            const handleScroll = (event) => {
                const target = event.target;
                const offset = 25;
                const isAtBottom = target.scrollTop + target.clientHeight >=
                    target.scrollHeight - offset;
                setIsAtBottom(isAtBottom);
            };
            current.addEventListener("scroll", handleScroll, {
                passive: true,
            });
            return () => {
                current.removeEventListener("scroll", handleScroll);
            };
        }
    }, []);
    (0, react_1.useEffect)(() => {
        if (visibilityRef.current) {
            let observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                    }
                    else {
                        setIsVisible(false);
                    }
                });
            }, {
                rootMargin: "0px 0px -150px 0px",
            });
            observer.observe(visibilityRef.current);
            return () => {
                observer.disconnect();
            };
        }
    });
    return {
        messagesRef,
        scrollRef,
        visibilityRef,
        scrollToBottom,
        isAtBottom,
        isVisible,
    };
};
exports.useScrollAnchor = useScrollAnchor;
