"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Document;
const document_1 = require("next/document");
function Document() {
    return (<document_1.Html lang="en">
      <document_1.Head>
        <meta property="og:title" content="screenpipe - context-aware ai for your desktop"/>
        <meta property="og:description" content="open source desktop app that records your screen & mic 24/7, extracts text & speech, and connects to ai to make it context-aware"/>
        <meta property="og:image" content="https://screenpi.pe/og-image.png"/>
        <meta property="og:url" content="https://screenpi.pe"/>
        <meta name="twitter:card" content="summary_large_image"/>
        <meta name="theme-color" content="#000000"/>

        {/* favicon stuff */}
        <link rel="icon" href="/favicon.ico"/>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"/>
      </document_1.Head>
      <body className="antialiased">
        <img referrerPolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=6124adb3-618c-466d-a12b-a046ba1443b9"/>
        <document_1.Main />
        <document_1.NextScript />
      </body>
    </document_1.Html>);
}
