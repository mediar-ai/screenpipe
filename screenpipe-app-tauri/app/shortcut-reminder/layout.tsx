"use client";

export default function ShortcutReminderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: "transparent" }}>
      <head>
        <style>{`
          *, *::before, *::after {
            box-sizing: border-box;
          }
          html, body, #__next, main {
            background: transparent !important;
            background-color: transparent !important;
            margin: 0;
            padding: 0;
            overflow: hidden;
            min-height: 100%;
            width: 100%;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
        `}</style>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
