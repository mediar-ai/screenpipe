import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <Script
          src="https://d345f39z3arwqc.cloudfront.net/entelligence-chat.js"
          strategy="beforeInteractive"
          type="module"
        />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
        <Script id="entelligence-init" strategy="afterInteractive">
          {`
            if (window.EntelligenceChat) {
              window.EntelligenceChat.init({
                analyticsData: {
                  repoName: "screenpipe",
                  organization: "mediar-ai",
                  apiKey: "fdANNfYgwriDY0iADKXzgrJdNIilNdYLvWlWtvMJCoQ",
                  theme: "dark"
                }
              });
            }
          `}
        </Script>
      </body>
    </Html>
  );
}
