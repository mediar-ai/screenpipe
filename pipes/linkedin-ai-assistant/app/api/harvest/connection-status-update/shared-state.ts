// Use global to persist state across requests
declare global {
  var shouldStopRefreshState: boolean;
}

export const shouldStopRefresh = () => globalThis.shouldStopRefreshState;
export const setStopRefresh = (value: boolean) => {
  console.log('setting global shouldStopRefresh to:', value);
  globalThis.shouldStopRefreshState = value;
}; 