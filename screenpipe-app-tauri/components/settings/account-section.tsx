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
  Key,
  EyeOff,
  Eye,
  ArrowUpRight,
  BookOpen,
  X,
} from "lucide-react";

import { toast } from "@/components/ui/use-toast";

import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Card } from "../ui/card";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { invoke } from "@tauri-apps/api/core";
import { PricingToggle } from "./pricing-toggle";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

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
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isAnnual, setIsAnnual] = useState(true);

  useEffect(() => {
    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl(async (urls) => {
        console.log("received deep link urls:", urls);
        for (const url of urls) {
          if (url.includes("api_key=")) {
            const apiKey = new URL(url).searchParams.get("api_key");
            if (apiKey) {
              updateSettings({ user: { token: apiKey } });
              await loadUser(apiKey);

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
                loadUser(settings.user.token!);
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
      title: "subscription",
      price: isAnnual ? "$200/year" : "$20/mo",
      features: [
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
    {
      title: "enterprise",
      price: "book a call",
      features: [
        "enterprise screen search engine",
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
      // const host = `${BASE_URL}/api/dev-stripe`;
      const host = `https://screenpi.pe/api/dev-stripe`;
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

  useEffect(() => {
    console.log("document visibility state:", document.visibilityState);

    const updatedUser = { ...settings.user, stripe_connected: true };
    updateSettings({ user: updatedUser });
  }, []);

  const updateProfile = async (updates: Partial<typeof settings.user>) => {
    if (!settings.user?.token) return;

    try {
      const response = await fetch(
        "https://screenpi.pe/api/plugins/dev-profile",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.user.api_key}`,
          },
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) throw new Error("failed to update profile");
    } catch (error) {
      console.error("failed to update profile:", error);
      toast({
        title: "update failed",
        description: "couldn't save your profile changes",
        variant: "destructive",
      });
    }
  };

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
                      openUrl(plan.url);
                    }}
                  />
                ))}
              </div>
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
                {settings.user?.api_key ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9"
                      onClick={() => openUrl("https://dashboard.stripe.com/")}
                    >
                      manage
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => {
                        if (settings.user) {
                          const updatedUser = {
                            ...settings.user,
                            api_key: undefined,
                            stripe_connected: false,
                          };
                          updateSettings({ user: updatedUser });
                          toast({
                            title: "stripe disconnected",
                            description:
                              "your stripe account has been disconnected",
                          });
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleConnectStripe}
                    className="h-9"
                    disabled={isConnectingStripe || !settings.user?.id}
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

        <Separator className="my-6" />

        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <h4 className="text-lg font-medium">developer profile</h4>
            <p className="text-sm text-muted-foreground">
              {settings.user?.api_key
                ? "customize your public developer profile, this will help us approve your pipe faster and help you get more users"
                : "connect your stripe account first to customize your developer profile"}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="bio">bio</Label>
              <Textarea
                id="bio"
                placeholder="tell us about yourself..."
                className="resize-none"
                rows={3}
                value={settings.user?.bio || ""}
                disabled={!settings.user?.api_key}
                onChange={(e) => {
                  if (settings.user) {
                    const updatedUser = {
                      ...settings.user,
                      bio: e.target.value,
                    };
                    updateSettings({ user: updatedUser });
                    updateProfile({ bio: e.target.value });
                  }
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="github">github username</Label>
              <Input
                id="github"
                placeholder="username"
                disabled={!settings.user?.api_key}
                value={settings.user?.github_username || ""}
                onChange={(e) => {
                  if (settings.user) {
                    const updatedUser = {
                      ...settings.user,
                      github_username: e.target.value,
                    };
                    updateSettings({ user: updatedUser });
                    updateProfile({ github_username: e.target.value });
                  }
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="website">website</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://..."
                value={settings.user?.website || ""}
                disabled={!settings.user?.api_key}
                onChange={(e) => {
                  if (settings.user) {
                    const updatedUser = {
                      ...settings.user,
                      website: e.target.value,
                    };
                    updateSettings({ user: updatedUser });
                    updateProfile({ website: e.target.value });
                  }
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="contact">additional contact</Label>
              <Input
                id="contact"
                placeholder="discord, twitter, etc..."
                value={settings.user?.contact || ""}
                disabled={!settings.user?.api_key}
                onChange={(e) => {
                  if (settings.user) {
                    const updatedUser = {
                      ...settings.user,
                      contact: e.target.value,
                    };
                    updateSettings({ user: updatedUser });
                    updateProfile({ contact: e.target.value });
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
