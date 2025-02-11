"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const google_1 = require("next/font/google");
require("./globals.css");
const toaster_1 = require("@/components/ui/toaster");
const geistSans = (0, google_1.Geist)({
    variable: "--font-sans",
    subsets: ["latin"],
});
const geistMono = (0, google_1.Geist_Mono)({
    variable: "--font-mono",
    subsets: ["latin"],
});
exports.metadata = {
    title: "Notion • Screenpipe",
    description: "Turn your screen time into a living knowledge base with AI",
};
function RootLayout({ children, }) {
    return (<html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <toaster_1.Toaster />
      </body>
    </html>);
}
