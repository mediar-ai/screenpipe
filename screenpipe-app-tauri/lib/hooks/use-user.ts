import { useState, useEffect, useCallback } from "react";
import { createStore } from "@tauri-apps/plugin-store";
import { localDataDir, join } from "@tauri-apps/api/path";
import supabase from "../supabase/client";

interface UserData {
  email: string;
  user_id: string;
  credits?: {
    amount: number;
  };
}

let store: Awaited<ReturnType<typeof createStore>> | null = null;

async function initStore() {
  const dataDir = await localDataDir();
  const storePath = await join(dataDir, "screenpipe", "store.bin");
  store = await createStore(storePath);
}

export function useUser() {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      if (!store) await initStore();

      try {
        const userId = await store!.get<string>("clerkUserId");

        // Get user and credits in a single query using joins
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select(
            `
            *,
            credits (
              amount
            )
          `
          )
          .eq("clerk_id", userId)
          .single();

        if (userError) throw userError;

        setUser({
          email: userData?.email,
          user_id: userId!,
          credits: userData?.credits?.[0],
        });
      } catch (err) {
        console.error("failed to load user:", err);
        setError(err instanceof Error ? err.message : "failed to load user");
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  return {
    user,
    isSignedIn: !!user,
    isLoading,
    error,
  };
}
