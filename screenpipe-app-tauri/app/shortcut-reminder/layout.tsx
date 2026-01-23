"use client";

import "../globals.css";

export default function ShortcutReminderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: "transparent" }}>
      <head>
        <style>{`
          html, body {
            background: transparent !important;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
          /* Suppress all tooltips */
          [title] {
            pointer-events: auto;
          }
          [data-tauri-drag-region] {
            -webkit-user-select: none;
            user-select: none;
          }
        `}</style>
      </head>
      <body style={{ background: "transparent", margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
