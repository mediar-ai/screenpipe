"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const google_1 = require("next/font/google");
require("./globals.css");
const toaster_1 = require("@/components/ui/toaster");
const posthog_provider_1 = __importDefault(require("@/components/providers/posthog-provider"));
const react_1 = require("@vercel/analytics/react");
const chat_button_1 = require("@/components/chat-button");
const use_settings_1 = require("@/lib/hooks/use-settings");
const geistSans = (0, google_1.Geist)({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});
const geistMono = (0, google_1.Geist_Mono)({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});
exports.metadata = {
    title: "Meeting • Screenpipe",
    description: "The AI notepad for people in back-to-back meetings",
};
function RootLayout({ children, }) {
    return (<html lang="en">
      <body suppressHydrationWarning={true} className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen`}>
        <posthog_provider_1.default>
          <use_settings_1.SettingsProvider>
            <main className="h-full p-4 overflow-hidden">
              {children}
            </main>
            <toaster_1.Toaster />
            <chat_button_1.ChatButton />
            <react_1.Analytics mode={process.env.NODE_ENV === "development" ? "development" : "production"}/>
          </use_settings_1.SettingsProvider>
        </posthog_provider_1.default>
      </body>
    </html>);
}
