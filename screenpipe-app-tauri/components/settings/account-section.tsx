"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  UserCog,
  ExternalLinkIcon,
  Sparkles,
  Zap,
  Brain,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Card } from "../ui/card";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { invoke } from "@tauri-apps/api/core";
import { PricingToggle } from "./pricing-toggle";
import posthog from "posthog-js";
import { platform } from "@tauri-apps/plugin-os";


function PlanCard({
  title,
  price,
  features,
  isActive,
  isSelected,
  onSelect,
}: {
  title: string;
  price: string;
  features: (string | JSX.Element)[];
  isActive?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Card
      className={cn(
        "rounded-xl border px-6 py-4 flex items-start gap-6 cursor-pointer transition-all",
        isActive
          ? "border-gray-500/50 bg-gray-500/5"
          : "border-border/50 bg-secondary/5",
        isSelected && !isActive && "border-primary ring-1 ring-primary",
        !isActive && "hover:border-primary/50"
      )}
      onClick={onSelect}
    >
      <div className="space-y-2 min-w-[200px]">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-medium opacity-80">{title}</h3>
        </div>
        <p className="text-lg">{price}</p>
      </div>

      <ul className="flex-grow space-y-2">
        {features.map((feature, i) => (
          <li
            key={i}
            className="flex items-center text-sm text-muted-foreground"
          >
            <span className="mr-2">•</span>
            {feature}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AccountSection() {
  const { settings, updateSettings, loadUser } = useSettings();
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
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

  const clientRefId = `${settings.user?.id}&customer_email=${encodeURIComponent(
    settings.user?.email ?? ""
  )}`;

  const plans = [
    {
      title: settings.user?.cloud_subscribed
        ? "your subscription"
        : "subscription",
      price: settings.user?.cloud_subscribed
        ? "active"
        : isAnnual
        ? "$200/year"
        : "$20/mo",
      features: settings.user?.cloud_subscribed
        ? [
            "unlimited screenpipe cloud",
            "priority support",
            <a
              key="portal"
              href={`https://billing.stripe.com/p/login/3cs6pT8Qbd846yc9AA?email=${encodeURIComponent(
                settings.user?.email || ""
              )}`}
              className="text-primary hover:underline cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                openUrl(
                  `https://billing.stripe.com/p/login/3cs6pT8Qbd846yc9AA?email=${encodeURIComponent(
                    settings.user?.email || ""
                  )}`
                );
              }}
            >
              manage subscription
            </a>,
          ]
        : [
            "unlimited screenpipe cloud",
            "priority support",
            isAnnual ? "17% discount applied" : "switch to annual for 17% off",
          ],
      url: isAnnual
        ? "https://buy.stripe.com/eVadRzfOCgAi5W0fZu" +
          `?client_reference_id=${clientRefId}`
        : "https://buy.stripe.com/7sIdRzbym4RA98c7sX" +
          `?client_reference_id=${clientRefId}`,
    },
  ];

  const handleConnectStripe = async () => {
    setIsConnectingStripe(true);
    try {
      // const host = `${BASE_URL}/api/dev-stripe`;
      const host = `https://screenpi.pe/api/dev/stripe-connect`;
      const response = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.user?.token}`,
        },
      });

      const { url } = await response.json();
      await openUrl(url);
    } catch (error) {
      console.warn("failed to connect stripe", error);
      toast({
        title: "failed to connect stripe",
        description: "please try again later",
        variant: "destructive",
      });
    } finally {
      setIsConnectingStripe(false);
    }
  };



  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Account Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Manage your account and authentication settings
        </p>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          {settings.user?.token ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-foreground" />
              logged in as {settings.user.email}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground" />
              not logged in - some features will be limited
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {settings.user?.token ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openUrl("https://screenpi.pe/user-dashboard")}
                className="hover:bg-secondary/80"
              >
                manage account <UserCog className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  updateSettings({ user: undefined });
                  toast({
                    title: "logged out",
                    description: "you have been logged out",
                  });
                }}
                className="hover:bg-secondary/80"
              >
                logout <ExternalLinkIcon className="w-4 h-4 ml-2" />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUrl("https://screenpi.pe/login")}
              className="hover:bg-secondary/80"
            >
              login <ExternalLinkIcon className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* Cloud features info - only show for non-subscribers */}
      {!settings.user?.cloud_subscribed && (
        <div className="space-y-4">
          {/* AI tier */}
          <Card className="p-4 space-y-3 bg-secondary/5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h4 className="font-medium">screenpipe cloud ai</h4>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                {settings.user?.token ? "50 free ai queries per day" : "25 free ai queries per day"}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                {settings.user?.token ? "access to claude haiku & sonnet" : "access to claude haiku"}
              </div>
            </div>
            <Separator className="my-2" />
            <div className="text-sm">
              <span className="text-muted-foreground">upgrade benefits: </span>
              <span className="text-foreground">unlimited queries, all models (claude opus), priority support</span>
            </div>
          </Card>

          {/* Cloud transcription */}
          <Card className="p-4 space-y-3 bg-secondary/5">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <h4 className="font-medium">cloud audio transcription</h4>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                save 2-3 GB of RAM
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                ~50% less CPU usage
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                higher quality transcription
              </div>
            </div>
            <Separator className="my-2" />
            <div className="text-sm text-muted-foreground">
              local whisper model uses significant resources. cloud transcription offloads this to our servers.
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-8">
        <div className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-6">
              <h4 className="text-lg font-medium">plans</h4>

              <PricingToggle isAnnual={isAnnual} onToggle={setIsAnnual} />

              <div className="flex flex-col gap-4">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.title}
                    title={plan.title}
                    price={plan.price}
                    features={plan.features}
                    onSelect={async () => {
                      if (!settings.user?.id) {
                        toast({
                          title: "not logged in",
                          description: "please login first to subscribe",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (!settings.user?.cloud_subscribed) {
                        posthog.capture("cloud_plan_selected");
                        openUrl(plan.url);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>




      </div>
    </div>
  );
}
