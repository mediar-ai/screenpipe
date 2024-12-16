"use client";
import React, { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge"; // Add this import
import { cn } from "@/lib/utils"; // Add this import

import { HelpCircle, RefreshCw, Coins, UserCog } from "lucide-react";

import { toast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";

import { useUser } from "@/lib/hooks/use-user";
import { open as openUrl } from "@tauri-apps/plugin-shell";

export function AccountSection() {
  const { user, loadUser } = useUser();
  const { localSettings, setLocalSettings } = useSettings();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshCredits = async () => {
    if (!localSettings.user?.token) return;

    setIsRefreshing(true);
    try {
      await loadUser(localSettings.user.token);
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

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>account</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => invoke("open_auth_window")}
          >
            <UserCog className="w-4 h-4 mr-2" />
            manage account
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* API Key Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="key" className="text-sm font-medium">
                api key
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[300px]">
                    <p>
                      your key syncs credits and settings across devices. find
                      it in your dashboard.{" "}
                      <span className="text-destructive font-semibold">
                        keep it private.
                      </span>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="key"
                value={localSettings.user?.token || ""}
                onChange={(e) => {
                  setLocalSettings((prev) => ({
                    ...prev,
                    user: { ...prev.user, token: e.target.value },
                  }));
                }}
                placeholder="enter your api key"
                className="font-mono text-sm"
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadUser(localSettings.user?.token || "");
                  toast({
                    title: "key updated",
                    description: "your key has been updated",
                  });
                }}
              >
                verify
              </Button>
            </div>
          </div>

          <Separator />

          {/* Credits Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">credits & billing</h4>
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {user?.credits?.amount || 0} remaining
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshCredits}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn("w-4 h-4", { "animate-spin": isRefreshing })}
                />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <div className="flex flex-col space-y-1.5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="px-1.5 text-xs">
                        monthly
                      </Badge>
                      <span className="text-sm font-mono">
                        15 credits/m, unlimited screenpipe cloud, priority
                        support
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        openUrl(
                          `https://buy.stripe.com/5kA6p79qefweacg5kJ?client_reference_id=${user?.id}&customer_email=${encodeURIComponent(
                            user?.email ?? ""
                          )}`
                        )
                      }
                    >
                      $30/mo
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <div className="flex flex-col space-y-1.5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="px-1.5 text-xs">
                        one-time
                      </Badge>
                      <span className="text-sm font-mono">50 credits</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        openUrl(
                          `https://buy.stripe.com/eVaeVD45UbfYeswcNd?client_reference_id=${user?.id}&customer_email=${encodeURIComponent(
                            user?.email ?? ""
                          )}`
                        )
                      }
                    >
                      $50
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border  ">
                <div className="flex flex-col space-y-1.5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="px-1.5 text-xs">
                        enterprise
                      </Badge>
                      <span className="text-sm font-mono">custom</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        openUrl(
                          "https://cal.com/louis030195/screenpipe-for-businesses"
                        )
                      }
                    >
                      book a call
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Developer Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">developer</h4>
                <Badge variant="outline" className="text-[10px] px-1.5">
                  beta
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <h5 className="text-sm font-medium mb-1">stripe connect</h5>
                  <p className="text-sm text-muted-foreground">
                    sell your pipes on the marketplace
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="shrink-0"
                >
                  <div className="flex items-center gap-2">
                    connect
                    <Badge variant="outline" className="uppercase text-[10px]">
                      soon
                    </Badge>
                  </div>
                </Button>
              </div>

              <div className="text-xs text-muted-foreground font-mono bg-muted/60 rounded p-2">
                $ screenpipe publish my-awesome-pipe
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
