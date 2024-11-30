import { SignInButton, SignOutButton, useUser } from "@clerk/nextjs";
import { Button } from "./ui/button";
import { useEffect } from "react";
import posthog from "posthog-js";
import { useSettings } from "@/lib/hooks/use-settings";
export function AuthButton() {
  const { isSignedIn, user } = useUser();
  const { settings } = useSettings();

  useEffect(() => {
    posthog.identify(settings.userId, {
      email: user?.primaryEmailAddress?.emailAddress,
      clerkId: user?.id,
    });
    posthog.setPersonProperties({
      email: user?.primaryEmailAddress?.emailAddress,
      clerkId: user?.id,
    });
  }, [isSignedIn, user, settings.userId]);

  return (
    <div >
      {isSignedIn ? (
        <SignOutButton>
          <Button variant="outline">
            sign out
          </Button>
        </SignOutButton>
      ) : (
        <SignInButton mode="redirect">
          <Button  variant="outline">
            sign in
          </Button>
        </SignInButton>
      )}
    </div>
  );
}
