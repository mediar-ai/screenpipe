import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useSettings } from "@/lib/hooks/use-settings";
import { Sparkles, Zap, Clock, Star, Coins, Loader2 } from "lucide-react";

const CREDIT_PACKS = [
  { id: "100", credits: 100, price: "$10", label: "100 credits" },
  { id: "500", credits: 500, price: "$40", label: "500 credits", popular: true },
  { id: "1000", credits: 1000, price: "$70", label: "1000 credits" },
] as const;

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: "daily_limit" | "model_not_allowed" | "rate_limit";
  resetsAt?: string;
}

export function UpgradeDialog({
  open,
  onOpenChange,
  reason = "daily_limit",
}: UpgradeDialogProps) {
  const { settings } = useSettings();
  const isLoggedIn = !!settings.user?.token;
  const creditsBalance = settings.user?.credits_balance ?? 0;
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [showPacks, setShowPacks] = useState(false);

  const handleSubscribe = async (isAnnual: boolean) => {
    const baseUrl = isAnnual
      ? "https://buy.stripe.com/00w7sL5sT0kCdzX7tD7ss0H"
      : "https://buy.stripe.com/9B63cv1cD1oG2Vjg097ss0G";
    const params = new URLSearchParams();
    if (settings.user?.id) params.set("client_reference_id", settings.user.id);
    if (settings.user?.email) params.set("customer_email", settings.user.email);
    await openUrl(`${baseUrl}?${params.toString()}`);
    onOpenChange(false);
  };

  const handleBuyCredits = async (packId: string) => {
    if (!settings.user?.clerk_id) {
      await openUrl("https://screenpi.pe/login");
      onOpenChange(false);
      return;
    }

    setBuyingPack(packId);
    try {
      const res = await fetch("https://screenpi.pe/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerk_id: settings.user.clerk_id,
          pack: packId,
          email: settings.user.email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        await openUrl(data.url);
        onOpenChange(false);
      }
    } catch (e) {
      console.error("credit checkout failed:", e);
    } finally {
      setBuyingPack(null);
    }
  };

  const handleLogin = async () => {
    await openUrl("https://screenpi.pe/login");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 shrink-0" />
            <span>
              {reason === "daily_limit"
                ? "you've used all your free queries today"
                : reason === "rate_limit"
                ? "too many requests"
                : "this model requires an upgrade"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-sm">
            {reason === "daily_limit"
              ? "buy credits to keep going, or upgrade to pro"
              : reason === "rate_limit"
              ? "upgrade for 3x higher rate limits"
              : "upgrade for access to all models"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {!showPacks ? (
            <>
              {/* Buy Credits - Primary action */}
              <Button
                className="w-full justify-start gap-3 h-auto py-4 relative"
                onClick={() => {
                  if (!isLoggedIn) {
                    handleLogin();
                    return;
                  }
                  setShowPacks(true);
                }}
              >
                <Coins className="h-5 w-5 shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <div className="font-medium">
                    buy credits
                    {creditsBalance > 0 && (
                      <span className="text-xs font-normal opacity-70 ml-2">
                        ({creditsBalance} remaining)
                      </span>
                    )}
                  </div>
                  <div className="text-xs opacity-80">
                    from $10 — use anytime after free daily quota
                  </div>
                </div>
              </Button>

              {/* Pro subscription */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => handleSubscribe(false)}
              >
                <Zap className="h-5 w-5 shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <div className="font-medium">screenpipe pro — $29/mo</div>
                  <div className="text-xs text-muted-foreground">
                    200 queries/day + 500 credits/mo + all models + sync
                  </div>
                </div>
              </Button>

              {/* Annual */}
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => handleSubscribe(true)}
              >
                <Star className="h-5 w-5 shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    $228/year
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      save 34%
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    everything in pro, billed annually
                  </div>
                </div>
              </Button>

              {!isLoggedIn && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={handleLogin}
                >
                  <Sparkles className="h-5 w-5 shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium">sign in for more</div>
                    <div className="text-xs text-muted-foreground">
                      get 50 queries/day + access to sonnet
                    </div>
                  </div>
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => onOpenChange(false)}
              >
                <Clock className="h-5 w-5 shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <div className="font-medium">wait until tomorrow</div>
                  <div className="text-xs text-muted-foreground">
                    free queries reset at midnight UTC
                  </div>
                </div>
              </Button>
            </>
          ) : (
            <>
              {/* Credit pack selection */}
              <p className="text-sm text-muted-foreground">
                choose a credit pack — each credit = 1 AI query after your free daily limit
              </p>
              {CREDIT_PACKS.map((pack) => (
                <Button
                  key={pack.id}
                  variant={pack.popular ? "default" : "outline"}
                  className="w-full justify-between h-auto py-3"
                  disabled={buyingPack !== null}
                  onClick={() => handleBuyCredits(pack.id)}
                >
                  <div className="flex items-center gap-2">
                    {buyingPack === pack.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Coins className="h-4 w-4" />
                    )}
                    <span>{pack.label}</span>
                    {pack.popular && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        popular
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono">{pack.price}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowPacks(false)}
                disabled={buyingPack !== null}
              >
                ← back
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
