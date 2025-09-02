"use client";

import { useEffect, useState } from "react";

interface HydrationBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * HydrationBoundary component that prevents hydration mismatches
 * by ensuring consistent rendering between server and client
 */
export function HydrationBoundary({ children, fallback }: HydrationBoundaryProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Mark as hydrated after the component mounts
    setIsHydrated(true);
  }, []);

  // During SSR and initial client render, show fallback or children
  if (!isHydrated) {
    return <>{fallback || children}</>;
  }

  // After hydration, show children normally
  return <>{children}</>;
}

/**
 * ClientOnly component that only renders on the client side
 * Use this for components that should never be server-side rendered
 */
export function ClientOnly({ children, fallback = null }: HydrationBoundaryProps) {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Hook to safely check if we're in the browser environment
 */
export function useIsBrowser() {
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    setIsBrowser(typeof window !== 'undefined');
  }, []);

  return isBrowser;
}

/**
 * Component that wraps content that might be affected by browser extensions
 * This prevents hydration mismatches by suppressing warnings for this subtree
 */
export function ExtensionSafeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div suppressHydrationWarning>
      {children}
    </div>
  );
}
