"use client";

import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { Avatar, AvatarFallback } from "./ui/avatar";
import posthog from "posthog-js";

export function AuthButton() {
  const { isSignedIn, user } = useUser();

  useEffect(() => {
    posthog.identify(user?.user_id, {
      email: user?.email,
    });
    posthog.setPersonProperties({
      email: user?.email,
    });
  }, [isSignedIn, user]);

  const handleSignIn = async () => {
    // This would typically open your auth window
    await invoke("open_auth_window");
  };

  return (
    <div>
      {isSignedIn ? (
        <Button variant="ghost" onClick={handleSignIn}>
          <Avatar>
            <AvatarFallback>
              {user?.email.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      ) : (
        <Button variant="outline" onClick={handleSignIn}>
          sign in
        </Button>
      )}
    </div>
  );
}
