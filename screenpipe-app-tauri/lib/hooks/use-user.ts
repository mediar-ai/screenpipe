import { useEffect, useState } from "react";
import { createStore } from "@tauri-apps/plugin-store";
import { localDataDir, join } from "@tauri-apps/api/path";
import { User, useSettings } from "./use-settings";
import { useInterval } from "./use-interval";
import { fetch } from "@tauri-apps/plugin-http";

let store: Awaited<ReturnType<typeof createStore>> | null = null;

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = await createStore(storePath);
}

async function verifyUserToken(token: string): Promise<User> {
  const response = await fetch("https://screenpi.pe/api/tauri", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error("failed to verify token");
  }

  const data = await response.json();
  return data.user as User;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings, updateSettings } = useSettings();

  // poll credits every 3 seconds if the settings dialog is open
  useInterval(() => {
    if (settings.user?.token) {
      loadUser(settings.user.token);
    }
  }, 3000);

  const loadUser = async (token: string) => {
    if (!store) await initStore();

    try {
      const userData = await verifyUserToken(token);
      // skip if user data did not change
      if (
        userData.id === user?.id &&
        userData.credits?.amount === user?.credits?.amount
      )
        return;
      setUser(userData);
      await updateSettings({ user: userData });
    } catch (err) {
      console.error("failed to load user:", err);
      setError(err instanceof Error ? err.message : "failed to load user");
    } finally {
      setIsLoading(false);
    }
  };

  // explicit refresh function
  const refreshUser = async () => {
    if (settings.user?.token) {
      await loadUser(settings.user.token);
    }
  };

  // load from settings
  useEffect(() => {
    if (settings.user?.token) {
      setUser(settings.user);
    }
  }, [settings.user?.token]);

  return {
    user,
    isSignedIn: !!user,
    isLoading,
    error,
    loadUser,
    refreshUser, // expose the refresh function
  };
}
