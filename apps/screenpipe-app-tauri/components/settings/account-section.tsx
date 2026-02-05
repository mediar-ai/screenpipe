"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  UserCog,
  ExternalLinkIcon,
  Sparkles,
  Zap,
  Shield,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Card } from "../ui/card";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { PricingToggle } from "./pricing-toggle";
import posthog from "posthog-js";


export function AccountSection() {
  const { settings, updateSettings, loadUser } = useSettings();
  const [isAnnual, setIsAnnual] = useState(true);

  useEffect(() => {
    if (!settings.user?.email) {
      posthog.capture("app_login", {
        email: settings.user?.email,
      });
    }

    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl(async (urls) => {
        console.log("received deep link urls:", urls);
        for (const url of urls) {
          // eg stripe / dev flow
          if (url.includes("stripe-connect")) {
            console.log("stripe connect url:", url);
            if (url.includes("/return")) {
              if (settings.user) {
                updateSettings({
                  user: {
                    ...settings.user,
                    stripe_connected: true,
                  },
                });
                loadUser(settings.user.token!, true);
              }
              toast({
                title: "stripe connected!",
                description: "your account is now set up for payments",
              });
            } else if (url.includes("/refresh")) {
              toast({
                title: "stripe setup incomplete",
                description: "please complete the stripe onboarding process",
              });
            }
          }
        }
      });
      return unsubscribeDeepLink;
    };

    let deepLinkUnsubscribe: (() => void) | undefined;
    setupDeepLink().then((unsubscribe) => {
      deepLinkUnsubscribe = unsubscribe;
    });

    return () => {
      if (deepLinkUnsubscribe) deepLinkUnsubscribe();
    };
  }, [settings.user?.token, updateSettings]);

  const handleCheckout = async () => {
    if (!settings.user?.id) {
      await openUrl("https://screenpi.pe/login");
      return;
    }
    if (!settings.user?.cloud_subscribed) {
      posthog.capture("cloud_plan_selected", { billing: isAnnual ? "yearly" : "monthly" });
      try {
        const response = await fetch("https://screenpi.pe/api/cloud-sync/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.user?.token}`,
          },
          body: JSON.stringify({
            tier: "pro",
            billingPeriod: isAnnual ? "yearly" : "monthly",
            userId: settings.user?.id,
            email: settings.user?.email,
          }),
        });
        const data = await response.json();
        if (data.url) {
          openUrl(data.url);

          // Poll for subscription status every 1 second after checkout
          let pollCount = 0;
          const maxPolls = 300; // 5 minutes
          const checkInterval = setInterval(async () => {
            pollCount++;
            try {
              const subResponse = await fetch(
                `https://screenpi.pe/api/cloud-sync/subscription?userId=${settings.user?.id}&email=${encodeURIComponent(settings.user?.email || "")}`,
                {
                  headers: { Authorization: `Bearer ${settings.user?.token}` },
                }
              );
              if (subResponse.ok) {
                const subData = await subResponse.json();
                if (subData.hasSubscription) {
                  clearInterval(checkInterval);
                  // Update user state with subscription
                  updateSettings({
                    user: { ...settings.user!, cloud_subscribed: true },
                  });
                  toast({
                    title: "subscription activated",
                    description: "welcome to screenpipe pro!",
                  });
                }
              }
            } catch (e) {
              console.error("polling error:", e);
            }
            if (pollCount >= maxPolls) {
              clearInterval(checkInterval);
            }
          }, 1000);
        } else {
          throw new Error(data.error || "failed to create checkout");
        }
      } catch (error) {
        toast({
          title: "failed to start checkout",
          description: String(error),
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + login status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Account
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {settings.user?.token
              ? `logged in as ${settings.user.email}`
              : "not logged in"}
          </p>
        </div>
        <div className="flex gap-2">
          {settings.user?.token ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUrl("https://screenpi.pe/user-dashboard")}
              >
                <UserCog className="w-4 h-4 mr-1.5" />
                manage
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  updateSettings({ user: undefined });
                  toast({ title: "logged out" });
                }}
              >
                logout
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUrl("https://screenpi.pe/login")}
            >
              login <ExternalLinkIcon className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Subscribed view */}
      {settings.user?.cloud_subscribed ? (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">screenpipe pro</h3>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">active</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openUrl(
                  `https://billing.stripe.com/p/login/3cs6pT8Qbd846yc9AA?email=${encodeURIComponent(
                    settings.user?.email || ""
                  )}`
                )
              }
            >
              manage subscription <ExternalLinkIcon className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>✓</span> encrypted cloud sync — 50GB, 3 devices
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span> cloud transcription — higher quality
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span> priority support
            </div>
          </div>
        </Card>
      ) : (
        /* Non-subscriber: pricing-first layout */
        <>
          {/* Pro plan card with animated border */}
          <div className="group relative rounded-lg p-[1px] overflow-hidden">
            {/* Animated spinning border — oversized rotated square with conic gradient */}
            <div
              className="absolute inset-[-100%] animate-[spin-border_4s_linear_infinite]"
              style={{
                background: "conic-gradient(from 0deg, transparent 0%, transparent 35%, hsl(var(--foreground)) 50%, transparent 65%, transparent 100%)",
              }}
            />
            {/* Inner card */}
            <Card className="relative p-5 bg-background border-0">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-5 w-5" />
                    <h3 className="text-lg font-semibold">screenpipe pro</h3>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{isAnnual ? "$19" : "$29"}</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                    {isAnnual && (
                      <span className="text-xs border border-foreground/20 text-foreground px-2 py-0.5 rounded-full font-medium">
                        save 34%
                      </span>
                    )}
                  </div>
                  {isAnnual && (
                    <p className="text-xs text-muted-foreground mt-0.5">$228/year, billed annually</p>
                  )}
                </div>
                <PricingToggle isAnnual={isAnnual} onToggle={setIsAnnual} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-4">
                <div className="flex items-center gap-2 text-foreground">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  encrypted cloud sync — 50GB, 3 devices
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  cloud transcription — higher quality, saves 2-3GB RAM
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  priority support
                </div>
              </div>

              <Button
                className="w-full bg-foreground text-background hover:bg-foreground/90"
                size="lg"
                onClick={handleCheckout}
              >
                {settings.user?.token ? "upgrade to pro" : "login & upgrade to pro"}
                <ExternalLinkIcon className="w-4 h-4 ml-2" />
              </Button>
            </Card>
          </div>

          {/* Current free tier - compact */}
          <div className="px-3 py-2 rounded-lg border border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">free tier:</span>{" "}
              local whisper transcription (uses ~2GB RAM)
            </p>
          </div>

          {/* CSS animation for spinning border */}
          <style>{`
            @keyframes spin-border {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
