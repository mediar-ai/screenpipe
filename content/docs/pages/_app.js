"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = App;
require("@/styles/globals.css");
// import Layout from '../components/layout';
exports.metadata = {
    title: "screenpipe",
    description: "AI Screen and Voice Recording Software | screenpipe",
    icons: {
        icon: "/favicon.ico",
    },
    twitter: {
        card: "summary_large_image",
        title: "screenpipe",
        site: "@screen_pipe",
        creator: "@screen_pipe",
        description: "AI Screen and Voice Recording Software | screenpipe",
    },
};
function App({ Component, pageProps }) {
    return <Component {...pageProps}/>;
}
