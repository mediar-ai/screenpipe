"use client";

import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { Avatar, AvatarFallback } from "./ui/avatar";
import posthog from "posthog-js";
import { DropdownMenuItem } from "./ui/dropdown-menu";
import { LogIn } from "lucide-react";

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
        <span className="p-2 text-sm text-muted-foreground select-none [-webkit-user-select:none]">
          {user?.email}
        </span>
      ) : (
        <DropdownMenuItem className="cursor-pointer" onClick={handleSignIn}>
          <LogIn className="mr-2 h-4 w-4" />
          <span>sign in</span>
        </DropdownMenuItem>
      )}
    </div>
  );
}
