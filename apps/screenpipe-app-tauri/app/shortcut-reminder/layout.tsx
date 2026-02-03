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
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
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
            font-family: "IBM Plex Mono", monospace;
          }
        `}</style>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
