"use client";

// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import React from "react";
import styles from "./startup-loader.module.css";

const FRAGMENTS = [
  [-90, -60], [90, 60], [30, 90], [-75, 25],
  [70, -80], [0, -95], [95, 0], [-95, 0],
  [-40, 80], [45, -45], [-80, -20], [75, 35],
];

type FragmentStyle = React.CSSProperties & { "--x": string; "--y": string };

/** Shared presentation for startup checks. Access decisions stay in the gate. */
export function StartupLoader({ label, vision }: { label: string; vision: string }) {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-background px-6 text-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-[440px] flex-col items-center text-center">
        <div className={styles.mark} aria-hidden="true">
          {FRAGMENTS.map(([x, y], index) => {
            const style: FragmentStyle = {
              "--x": `${x}px`,
              "--y": `${y}px`,
              animationDelay: `${index * -0.13}s`,
            };
            return <span key={index} className={styles.fragment} style={style} />;
          })}
          <img src="/128x128.png" alt="" width={60} height={60} />
        </div>
        <h1 className="mt-1.5 text-xl font-medium tracking-tight">Screenpipe</h1>
        <p className={styles.vision}>{vision}</p>
        <p className="mt-6 text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
