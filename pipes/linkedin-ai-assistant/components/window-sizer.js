"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowSizer = WindowSizer;
const react_1 = require("react");
function WindowSizer() {
    (0, react_1.useEffect)(() => {
        // Set initial window size
        fetch("http://localhost:11435/window-size", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: "linkedin-ai-assistant",
                width: 950,
                height: 550,
            }),
        }).catch(err => {
            console.error("failed to set window size:", err);
        });
    }, []);
    return null;
}
