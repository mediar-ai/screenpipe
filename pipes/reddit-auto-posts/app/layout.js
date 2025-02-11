"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const toaster_1 = require("@/components/toaster");
const google_1 = require("next/font/google");
require("./globals.css");
exports.metadata = {
    title: "Reddit • Screenpipe",
    description: "Advertise your content, or learn, automatically",
};
const inter = (0, google_1.Inter)({ subsets: ["latin"] });
function RootLayout({ children, }) {
    return (<html lang="en">
      <body className={inter.className}>
        {children}

        <toaster_1.Toaster />
      </body>
    </html>);
}
