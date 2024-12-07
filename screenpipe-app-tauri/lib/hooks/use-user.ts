import { useState, useEffect, useCallback } from "react";
import { createStore } from "@tauri-apps/plugin-store";
import { localDataDir, join } from "@tauri-apps/api/path";

interface UserData {
  token: string;
  email: string;
  user_id: string;
  displayName: string;
  photoURL: string;
}



let store: Awaited<ReturnType<typeof createStore>> | null = null;

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = await createStore(storePath);
}

async function checkSubscription(email: string): Promise<boolean> {
  try {
    const isDev = window.location.href.includes("localhost");
    // const baseUrl = isDev ? "http://localhost:3001" : "https://screenpi.pe";
    const baseUrl = "https://screenpi.pe";

    const response = await fetch(`${baseUrl}/api/stripe-loom`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      ...(isDev ? {} : { credentials: "include" }),
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error("subscription check failed with status:", response.status);
      return false;
    }

    const data = await response.json();
    return data.hasActiveSubscription;
  } catch (error) {
    console.error("failed to check subscription:", error);
    return false;
  }
}

export function useUser() {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      if (!store) await initStore();

      try {
        const savedUser = await store!.get<UserData>("auth_data");
        setUser(savedUser || null);
      } catch (err) {
        console.error("failed to load user:", err);
        setError(err instanceof Error ? err.message : "failed to load user");
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const checkLoomSubscription = useCallback(async () => {
    if (!user?.email) return false;
    return checkSubscription(user.email);
  }, [user?.email]);

  return {
    user,
    isSignedIn: !!user,
    isLoading,
    error,
    checkLoomSubscription,
  };
}
