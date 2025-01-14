// Use global to persist state across requests
declare global {
  // eslint-disable-next-line no-var
  var shouldStopRefreshState: boolean;
}

// Initialize the global variable if it doesn't exist
if (typeof globalThis.shouldStopRefreshState === 'undefined') {
  globalThis.shouldStopRefreshState = false;
}

export const shouldStopRefresh = () => globalThis.shouldStopRefreshState;
export const setStopRefresh = (value: boolean) => {
  console.log('setting global shouldStopRefresh to:', value);
  globalThis.shouldStopRefreshState = value;
}; 