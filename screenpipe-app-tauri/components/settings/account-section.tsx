"use client";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  HelpCircle,
  RefreshCw,
  Coins,
  UserCog,
  ExternalLinkIcon,
} from "lucide-react";

import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";

import { useUser } from "@/lib/hooks/use-user";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Card } from "../ui/card";
import {
  onOpenUrl,
  getCurrent as getCurrentDeepLinkUrls,
} from "@tauri-apps/plugin-deep-link";

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
  features: string[];
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
  const { user, loadUser } = useUser();
  const { settings, updateSettings } = useSettings();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    // Listen for deep link URL opens
    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl((urls) => {
        console.log("received deep link urls:", urls);
        for (const url of urls) {
          if (url.includes("api_key=")) {
            const apiKey = new URL(url).searchParams.get("api_key");
            if (apiKey) {
              updateSettings({ user: { token: apiKey } });
              toast({
                title: "logged in!",
                description: "your api key has been set",
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
  }, []);

  const handleRefreshCredits = async () => {
    if (!settings.user?.token) return;

    setIsRefreshing(true);
    try {
      await loadUser(settings.user.token);
      toast({
        title: "credits refreshed",
        description: "your credit balance has been updated",
      });
    } catch (error) {
      toast({
        title: "failed to refresh credits",
        description: "please try again later",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const clientRefId = `${user?.id}&customer_email=${encodeURIComponent(
    user?.email ?? ""
  )}`;

  const plans = [
    {
      title: "monthly",
      price: "$30/mo",
      features: [
        "15 credits/mo",
        "unlimited screenpipe cloud",
        "priority support",
      ],
      url: `https://buy.stripe.com/5kA6p79qefweacg5kJ?client_reference_id=${clientRefId}`,
    },
    {
      title: "one-time",
      price: "$50",
      features: ["50 credits", "never expires", "priority support"],
      url: `https://buy.stripe.com/eVaeVD45UbfYeswcNd?client_reference_id=${clientRefId}`,
    },
    {
      title: "enterprise",
      price: "book a call",
      features: [
        "enterprise process intelligence & process mining",
        "dedicated support",
        "consulting",
        "custom features",
      ],
      url: "https://cal.com/louis030195/screenpipe-for-businesses",
    },
  ];

  return (
    <div className="w-full space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">account settings</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openUrl("https://screenpi.pe/login")}
          className="hover:bg-secondary/80"
        >
          manage account <ExternalLinkIcon className="w-4 h-4 ml-2" />
        </Button>
      </div>

      <div className="space-y-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coins className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">credits & usage</h4>
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
                {user?.credits?.amount || 0} available
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefreshCredits}
              disabled={isRefreshing}
              className="h-8 w-8"
            >
              <RefreshCw
                className={cn("w-4 h-4", { "animate-spin": isRefreshing })}
              />
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium text-muted-foreground">
                screenpipe api key
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/50" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[280px]">
                    <p className="text-xs leading-relaxed">
                      your key syncs credits and settings across devices. you
                      can find it in your dashboard.{" "}
                      <span className="text-destructive font-medium">
                        keep it private.
                      </span>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="flex gap-2">
              <Input
                value={settings.user?.token || ""}
                onChange={(e) => {
                  updateSettings({
                    user: { token: e.target.value },
                  });
                }}
                placeholder="enter your api key"
                className="font-mono text-sm bg-secondary/30"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  loadUser(settings.user?.token || "");
                  toast({ title: "key updated" });
                }}
              >
                verify
              </Button>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="grid gap-4">
            <div className="space-y-6">
              <h4 className="text-lg font-medium">active plan</h4>

              <div className="flex flex-col gap-4">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.title}
                    title={plan.title}
                    price={plan.price}
                    features={plan.features}
                    isSelected={selectedPlan === plan.title}
                    onSelect={() => setSelectedPlan(plan.title)}
                  />
                ))}
              </div>

              {selectedPlan && (
                <Button
                  className="w-full text-white"
                  onClick={() => {
                    const plan = plans.find((p) => p.title === selectedPlan);
                    if (plan) openUrl(plan.url);
                  }}
                >
                  Checkout
                </Button>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <h4 className="text-lg font-medium">developer tools</h4>
            <p className="text-sm text-muted-foreground">
              build and sell custom pipes
            </p>
          </div>
          <Badge
            variant={"secondary"}
            className="uppercase text-[10px] font-medium"
          >
            COMING SOON
          </Badge>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col space-y-6">
            <div className="p-5 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-[#635BFF]/10 rounded-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="rounded-md"
                      src="https://images.stripeassets.com/fzn2n1nzq965/HTTOloNPhisV9P4hlMPNA/cacf1bb88b9fc492dfad34378d844280/Stripe_icon_-_square.svg?q=80&w=1082"
                      alt=""
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">stripe connect</div>
                    <p className="text-xs text-muted-foreground">
                      set up payments to receive earnings from your pipes
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    openUrl(
                      "https://connect.stripe.com/oauth/authorize?client_id=YOUR_CLIENT_ID"
                    )
                  }
                  className="h-9"
                  disabled
                >
                  connect
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                publish your pipe with cli
              </Label>
              <div className="font-mono text-xs bg-gray-50 rounded-lg p-4 border border-border/50">
                $ screenpipe publish my-awesome-pipe
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
