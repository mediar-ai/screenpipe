// lib/hooks/use-server-url.ts
import { useState, useEffect } from "react";
import { useSettings } from "./use-settings";

export function useServerUrl() {
  const { settings } = useSettings();
  const [serverUrl, setServerUrl] = useState("http://localhost:3030");

  useEffect(() => {
    if (settings.port) {
      setServerUrl(`http://localhost:${settings.port}`);
    }
  }, [settings.port]);

  return serverUrl;
}
