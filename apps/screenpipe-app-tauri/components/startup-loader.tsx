"use client";

// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import React from "react";
import styles from "./startup-loader.module.css";

/** Shared presentation for startup checks. Access decisions stay in the gate. */
export function StartupLoader({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-background px-6 text-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <div className={styles.mark} aria-hidden="true">
          <span className={styles.frame} />
          <span className={styles.frame} />
          <span className={styles.frame} />
          <img src="/128x128.png" alt="" width={64} height={64} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Screenpipe</h1>
        <p className="mt-2 text-xs text-muted-foreground">{label}</p>
        <div className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
