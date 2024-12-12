"use client";

import { Button } from "@/components/ui/button";
import { open } from "@tauri-apps/plugin-shell";
import { toast } from "./ui/use-toast";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";

interface StripeSubscriptionButtonProps {
  onSubscriptionComplete?: () => void;
}

export function StripeSubscriptionButton({
  onSubscriptionComplete,
}: StripeSubscriptionButtonProps) {
  const { isSignedIn, user } = useUser();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const checkSubscription = async () => {
      if (user) {
        const hasSubscription = false;
        setIsSubscribed(hasSubscription);
        if (hasSubscription && onSubscriptionComplete) {
          onSubscriptionComplete();
        }
      }
    };
    checkSubscription();
  }, [user]);

  const handleSubscribe = async () => {
    posthog.capture("subscribe_button_clicked", {
      email: user?.email,
    });
    if (!isSignedIn) {
      toast({
        title: "sign in required",
        description: "please sign in to subscribe to the Loom pipe",
        variant: "destructive",
      });
      return;
    }

    try {
      // Direct Stripe Checkout URL with price_id
      const checkoutUrl = `https://buy.stripe.com/28o00JcCq2JsgAE9AX?prefilled_email=${user?.email}&client_reference_id=${user?.id}`;

      // Open Stripe checkout in default browser
      await open(checkoutUrl);

      // Store subscription locally
      setIsSubscribed(true);

      if (onSubscriptionComplete) {
        onSubscriptionComplete();
      }
    } catch (error) {
      console.error("failed to open stripe checkout:", error);
      toast({
        title: "error",
        description: "failed to open subscription page. please try again.",
        variant: "destructive",
      });
    }
  };

  if (isSubscribed) {
    return null;
  }

  return (
    <Button
      onClick={handleSubscribe}
      variant="outline"
      className="h-8 min-w-[100px]"
    >
      subscribe - $10/month
    </Button>
  );
}
