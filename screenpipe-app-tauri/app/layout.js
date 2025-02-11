"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = RootLayout;
const google_1 = require("next/font/google");
require("./globals.css");
const providers_1 = require("./providers");
const toaster_1 = require("@/components/ui/toaster");
const react_1 = require("react");
const inter = (0, google_1.Inter)({ subsets: ["latin"] });
// Debounced localStorage writer
const createDebouncer = (wait) => {
    let timeout;
    return (fn) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(), wait);
    };
};
function RootLayout({ children, }) {
    (0, react_1.useEffect)(() => {
        if (typeof window === "undefined")
            return;
        const logs = [];
        const MAX_LOGS = 1000;
        const originalConsole = Object.assign({}, console);
        const debouncedWrite = createDebouncer(1000);
        ["log", "error", "warn", "info"].forEach((level) => {
            console[level] = (...args) => {
                // Call original first for performance
                originalConsole[level](...args);
                // Add to memory buffer
                logs.push(`[${level.toUpperCase()}] ${args
                    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
                    .join(" ")}`);
                // Trim buffer if needed
                if (logs.length > MAX_LOGS) {
                    logs.splice(0, logs.length - MAX_LOGS);
                }
                // Debounced write to localStorage
                debouncedWrite(() => {
                    try {
                        localStorage.setItem("console_logs", logs.join("\n"));
                    }
                    catch (e) {
                        // If localStorage is full, clear half the logs
                        logs.splice(0, logs.length / 2);
                        localStorage.setItem("console_logs", logs.join("\n"));
                    }
                });
            };
        });
    }, []);
    return (<html lang="en" suppressHydrationWarning>
      <providers_1.Providers>
        <body className={inter.className}>
          {children}
          <toaster_1.Toaster />
        </body>
      </providers_1.Providers>
    </html>);
}
