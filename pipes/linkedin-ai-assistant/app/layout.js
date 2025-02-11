"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const toaster_1 = require("@/components/toaster");
const google_1 = require("next/font/google");
require("./globals.css");
const window_sizer_1 = require("@/components/window-sizer");
exports.metadata = {
    title: "LinkedIn AI Assistant",
    description: "AI agent for LinkedIn",
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "16x16" },
            { url: "/icon-32.png", sizes: "32x32" },
            { url: "/icon-128.png", sizes: "128x128" }
        ]
    }
};
const inter = (0, google_1.Inter)({ subsets: ["latin"] });
function RootLayout({ children, }) {
    return (<html lang="en">
      <body className={inter.className}>
        <window_sizer_1.WindowSizer />
        {children}
        <toaster_1.Toaster />
      </body>
    </html>);
}
