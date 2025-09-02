/**
 * Utility functions to handle hydration mismatches caused by browser extensions
 */

/**
 * List of known browser extension attributes that can cause hydration issues
 */
export const BROWSER_EXTENSION_ATTRIBUTES = [
  // Grammarly
  'data-new-gr-c-s-check-loaded',
  'data-gr-ext-installed',
  'data-new-gr-c-s-loaded',
  'data-gr-c-s-loaded',
  'data-gr-ext-disabled',
  
  // LastPass
  'data-lastpass-icon-root',
  'data-lastpass-root',
  'data-lastpass-infield',
  
  // Honey
  'data-honey-extension-installed',
  'data-honey-extension',
  
  // Pinterest
  'data-pinterest-extension-installed',
  
  // AdBlock
  'data-adblockkey',
  'data-adblock-key',
  
  // Other common extensions
  'data-lt-installed', // LanguageTool
  'cz-shortcut-listen', // ColorZilla
  'data-extension-installed',
  'data-ext-installed',
  'data-1p-installed', // 1Password
  'data-dashlane-installed',
  'data-bitwarden-installed',
] as const;

/**
 * Patterns to match extension-like attributes
 */
export const EXTENSION_ATTRIBUTE_PATTERNS = [
  /^data-.*-extension.*$/i,
  /^data-.*-ext-.*$/i,
  /^data-gr-.*$/i,
  /^data-lastpass.*$/i,
  /^data-honey.*$/i,
  /^data-.*-installed$/i,
  /^data-.*-loaded$/i,
  /^data-.*-check-loaded$/i,
] as const;

/**
 * Check if an attribute name looks like a browser extension attribute
 */
export function isExtensionAttribute(attributeName: string): boolean {
  // Check against known attributes
  if (BROWSER_EXTENSION_ATTRIBUTES.includes(attributeName as any)) {
    return true;
  }
  
  // Check against patterns
  return EXTENSION_ATTRIBUTE_PATTERNS.some(pattern => 
    pattern.test(attributeName)
  );
}

/**
 * Clean up browser extension attributes from an element
 */
export function cleanupExtensionAttributes(element: Element): void {
  if (!element || !element.attributes) return;
  
  const attributesToRemove: string[] = [];
  
  // Collect attributes to remove
  Array.from(element.attributes).forEach(attr => {
    if (isExtensionAttribute(attr.name)) {
      attributesToRemove.push(attr.name);
    }
  });
  
  // Remove the attributes
  attributesToRemove.forEach(attrName => {
    element.removeAttribute(attrName);
  });
}

/**
 * Set up a MutationObserver to watch for extension attributes being added
 */
export function setupExtensionAttributeWatcher(
  element: Element = document.body,
  callback?: (attributeName: string) => void
): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && 
          mutation.attributeName &&
          isExtensionAttribute(mutation.attributeName)) {
        
        // Remove the extension attribute
        if (mutation.target instanceof Element) {
          mutation.target.removeAttribute(mutation.attributeName);
        }
        
        // Call callback if provided
        callback?.(mutation.attributeName);
      }
    });
  });

  // Start observing
  observer.observe(element, {
    attributes: true,
    attributeFilter: [...BROWSER_EXTENSION_ATTRIBUTES]
  });

  return observer;
}

/**
 * Debounced cleanup function to prevent excessive DOM manipulation
 */
export function createDebouncedCleanup(
  element: Element = document.body,
  delay: number = 100
): () => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      cleanupExtensionAttributes(element);
    }, delay);
  };
}

/**
 * Check if we're in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Safe way to access document.body
 */
export function getBodyElement(): HTMLBodyElement | null {
  if (!isBrowser()) return null;
  return document.body as HTMLBodyElement | null;
}

/**
 * Initialize extension attribute cleanup for the entire page
 */
export function initializeExtensionCleanup(): () => void {
  if (!isBrowser()) {
    return () => {}; // No-op for SSR
  }
  
  const body = getBodyElement();
  if (!body) {
    return () => {};
  }
  
  // Initial cleanup
  cleanupExtensionAttributes(body);
  
  // Set up watcher
  const observer = setupExtensionAttributeWatcher(body);
  
  // Set up periodic cleanup as fallback
  const debouncedCleanup = createDebouncedCleanup(body, 500);
  const intervalId = setInterval(debouncedCleanup, 2000);
  
  // Return cleanup function
  return () => {
    observer.disconnect();
    clearInterval(intervalId);
  };
}
