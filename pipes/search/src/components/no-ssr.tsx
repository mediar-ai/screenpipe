"use client";

import { useEffect, useState } from "react";

interface NoSSRProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * NoSSR component to prevent hydration mismatches
 * This component only renders its children on the client side
 */
export function NoSSR({ children, fallback = null }: NoSSRProps) {
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
 * Hook to detect if we're on the client side
 * Useful for conditional rendering that might cause hydration issues
 */
export function useIsClient() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}

/**
 * Component that suppresses hydration warnings for its children
 * Use this for components that might have browser extension interference
 */
export function SuppressHydration({ children }: { children: React.ReactNode }) {
  return <div suppressHydrationWarning>{children}</div>;
}
