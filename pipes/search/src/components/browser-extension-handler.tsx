"use client";

import { useEffect, useState } from "react";
import { initializeExtensionCleanup, isBrowser, getBodyElement } from "@/lib/hydration-utils";

/**
 * Component that handles browser extension attributes to prevent hydration mismatches
 * This component runs only on the client side and manages dynamic attributes
 * added by browser extensions like Grammarly, LastPass, etc.
 */
export function BrowserExtensionHandler() {
  useEffect(() => {
    // Initialize the extension cleanup system
    const cleanup = initializeExtensionCleanup();

    // Return the cleanup function
    return cleanup;
  }, []);

  // This component doesn't render anything
  return null;
}

/**
 * Hook to safely access browser extension status
 * Returns information about detected extensions without causing hydration issues
 */
export function useBrowserExtensions() {
  const [extensions, setExtensions] = useState<{
    grammarly: boolean;
    lastpass: boolean;
    adblock: boolean;
    honey: boolean;
  }>({
    grammarly: false,
    lastpass: false,
    adblock: false,
    honey: false,
  });

  useEffect(() => {
    if (!isBrowser()) return;

    // Detect extensions safely on the client side
    const detectExtensions = () => {
      const body = getBodyElement();
      if (!body) return;

      setExtensions({
        grammarly: body.hasAttribute('data-new-gr-c-s-check-loaded') ||
                  body.hasAttribute('data-gr-ext-installed') ||
                  body.hasAttribute('data-new-gr-c-s-loaded'),
        lastpass: body.hasAttribute('data-lastpass-icon-root') ||
                  body.hasAttribute('data-lastpass-root'),
        adblock: body.hasAttribute('data-adblockkey') ||
                body.hasAttribute('data-adblock-key'),
        honey: body.hasAttribute('data-honey-extension-installed') ||
               body.hasAttribute('data-honey-extension'),
      });
    };

    // Detect after a short delay to allow extensions to load
    const timeoutId = setTimeout(detectExtensions, 500);

    return () => clearTimeout(timeoutId);
  }, []);

  return extensions;
}
