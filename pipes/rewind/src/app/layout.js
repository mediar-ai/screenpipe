"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamic = exports.metadata = void 0;
exports.default = RootLayout;
const google_1 = require("next/font/google");
require("./globals.css");
const geistSans = (0, google_1.Geist)({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});
const geistMono = (0, google_1.Geist_Mono)({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});
exports.metadata = {
    title: "Timeline • Screenpipe",
    description: "View your screenpipe recordings in a timeline",
};
exports.dynamic = "force-dynamic";
function RootLayout(_a) {
    return __awaiter(this, arguments, void 0, function* ({ children, }) {
        const checkSettings = () => __awaiter(this, void 0, void 0, function* () {
            try {
                const port = process.env.PORT || 3000;
                const response = yield fetch(`http://localhost:${port}/api/settings`);
                const settings = yield response.json();
                return settings.enableFrameCache;
            }
            catch (error) {
                console.error("Failed to load settings:", error);
                return false;
            }
        });
        const enabled = yield checkSettings();
        return (<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				{!enabled ? (<div className="flex items-center justify-center h-screen">
						<div className="text-center space-y-4">
							<h2 className="text-xl font-medium">Frame Cache Disabled</h2>
							<p className="text-muted-foreground">
								Please enable frame cache in settings to use the timeline
								feature.
							</p>
						</div>
					</div>) : (<>{children}</>)}
			</body>
		</html>);
    });
}
