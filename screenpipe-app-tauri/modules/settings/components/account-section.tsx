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
  Key,
  EyeOff,
  Eye,
  ArrowUpRight,
  BookOpen,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
} from "lucide-react";

import { toast } from "@/components/ui/use-toast";

import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Card } from "../ui/card";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { invoke } from "@tauri-apps/api/core";

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
  const { settings, updateSettings, loadUser } = useSettings();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl(async (urls) => {
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
          if (url.includes("return") || url.includes("refresh")) {
            console.log("stripe connect url:", url);
            if (url.includes("/return")) {
              const apiKey = new URL(url).searchParams.get("api_key")!;
              if (settings.user) {
                updateSettings({
                  user: {
                    ...settings.user,
                    api_key: apiKey,
                    stripe_connected: true,
                  },
                });
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

  const handleRefreshCredits = async () => {
    if (!settings.user?.token) return;

    setIsRefreshing(true);
    try {
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

  const clientRefId = `${settings.user?.id}&customer_email=${encodeURIComponent(
    settings.user?.email ?? ""
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

  const handleConnectStripe = async () => {
    setIsConnectingStripe(true);
    try {
      const BASE_URL =
        (await invoke("get_env", { name: "BASE_URL_PRIVATE" })) ??
        "https://screenpi.pe";
      const host = `${BASE_URL}/api/dev-stripe`;
      const response = await fetch(host, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: settings.user?.id,
        }),
      });

      const { url } = await response.json();
      await openUrl(url);
    } catch (error) {
      toast({
        title: "failed to connect stripe",
        description: "please try again later",
        variant: "destructive",
      });
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleCopyApiKey = () => {
    if (settings.user?.token) {
      navigator.clipboard.writeText(settings.user.token);
      toast({
        title: "copied to clipboard",
        description: "api key copied successfully",
      });
    }
  };

  useEffect(() => {
    console.log("document visibility state:", document.visibilityState);

    const updatedUser = { ...settings.user, stripe_connected: true };
    updateSettings({ user: updatedUser });
  }, []);

  return (
    <div className="w-full space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">account settings</h1>
        <div className="flex gap-2">
          {settings.user?.token && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUrl("https://accounts.screenpi.pe/user")}
              className="hover:bg-secondary/80"
            >
              manage account <UserCog className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => openUrl("https://screenpi.pe/login")}
            className="hover:bg-secondary/80"
          >
            login <ExternalLinkIcon className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coins className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">credits & usage</h4>
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
                {settings.user?.credits?.amount || 0} available
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
                      (dev preview) you can use your key to use screenpipe cloud
                      with code.{" "}
                      <span className="text-destructive font-medium">
                        keep it private.
                      </span>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={settings.user?.token || ""}
                    type={showApiKey ? "text" : "password"}
                    onChange={(e) => {
                      updateSettings({
                        user: { token: e.target.value },
                      });
                      loadUser(e.target.value);
                    }}
                    placeholder="enter your api key"
                    className="font-mono text-sm bg-secondary/30 pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCopyApiKey}
                      disabled={!settings.user?.token}
                    >
                      <CopyIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
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
                      receive earnings from your pipes (
                      <a
                        href={`mailto:louis@screenpi.pe?subject=${encodeURIComponent(
                          "i want to create and monetize a pipe"
                        )}&body=${encodeURIComponent(
                          "hi louis,\n\nI'm interested in creating a pipe for screenpipe.\n\n- what I want to build:\n- I'm a programmer: [yes/no]\n- my github: "
                        )}`}
                        className="underline hover:text-primary"
                        target="_blank"
                      >
                        email louis@screenpi.pe
                      </a>{" "}
                      for private beta access)
                    </p>
                  </div>
                </div>
                {settings.user?.stripe_connected ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9"
                    onClick={() => openUrl("https://dashboard.stripe.com/")}
                  >
                    manage
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleConnectStripe}
                    className="h-9"
                    disabled={isConnectingStripe}
                  >
                    {isConnectingStripe ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      "connect"
                    )}
                  </Button>
                )}
              </div>
            </div>
            {settings.user?.api_key && (
              <div className="p-5 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-gray-900/10 rounded-md">
                      <Key className="w-4 h-4 text-gray-900/60" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">api key</div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 hover:bg-transparent"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">
                        {showApiKey
                          ? settings.user?.api_key
                          : settings.user?.api_key?.replace(/./g, "*")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      if (settings.user?.api_key) {
                        navigator.clipboard.writeText(settings.user.api_key);
                        toast({
                          title: "copied to clipboard",
                          description:
                            "your api key has been copied to your clipboard",
                        });
                      }
                    }}
                    disabled={!settings.user?.api_key}
                  >
                    copy
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-4">
              <div className="p-5 border border-border/50 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-gray-900/10 rounded-md">
                      <BookOpen className="w-4 h-4 text-gray-900/60" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium">documentation</div>
                      <p className="text-xs text-muted-foreground">
                        learn how to build and publish custom pipes
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://docs.screenpi.pe/docs/plugins"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors rounded-md bg-secondary hover:bg-secondary/80"
                  >
                    read docs
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
