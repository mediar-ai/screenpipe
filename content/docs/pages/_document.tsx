import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta
          property="og:title"
          content="screenpipe - context-aware ai for your desktop"
        />
        <meta
          property="og:description"
          content="open source desktop app that records your screen & mic 24/7, extracts text & speech, and connects to ai to make it context-aware"
        />
        <meta
          property="og:image"
          content="https://screenpi.pe/og-image.png"
        />
        <meta property="og:url" content="https://screenpi.pe" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content="#000000" />

        {/* favicon stuff */}
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
