import React from "react";
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
import { Sparkles, Zap, Clock, Star } from "lucide-react";

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
  resetsAt,
}: UpgradeDialogProps) {
  const { settings } = useSettings();
  const isLoggedIn = !!settings.user?.token;

  const handleSubscribe = async (isAnnual: boolean) => {
    const baseUrl = isAnnual
      ? "https://buy.stripe.com/00w7sL5sT0kCdzX7tD7ss0H"
      : "https://buy.stripe.com/9B63cv1cD1oG2Vjg097ss0G";
    const params = new URLSearchParams();
    if (settings.user?.id) {
      params.set("client_reference_id", settings.user.id);
    }
    if (settings.user?.email) {
      params.set("customer_email", settings.user.email);
    }
    await openUrl(`${baseUrl}?${params.toString()}`);
    onOpenChange(false);
  };

  const handleLogin = async () => {
    await openUrl("https://screenpi.pe/login");
    onOpenChange(false);
  };

  const formatResetTime = () => {
    if (!resetsAt) return "tomorrow";
    try {
      const reset = new Date(resetsAt);
      const now = new Date();
      const hoursLeft = Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60));
      if (hoursLeft <= 1) return "in about an hour";
      if (hoursLeft < 24) return `in ${hoursLeft} hours`;
      return "tomorrow";
    } catch {
      return "tomorrow";
    }
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
              ? `your free queries reset ${formatResetTime()}, or upgrade for unlimited access`
              : reason === "rate_limit"
              ? "you're sending requests too fast — upgrade for 3x higher rate limits"
              : "upgrade for unlimited access to claude opus & more"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* Annual - Primary/Preferred Option */}
          <Button
            className="w-full justify-start gap-3 h-auto py-4 relative"
            onClick={() => handleSubscribe(true)}
          >
            <Star className="h-5 w-5 shrink-0" />
            <div className="text-left flex-1 min-w-0">
              <div className="font-medium flex items-center gap-2 flex-wrap">
                <span>$228/year</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  save 34%
                </Badge>
              </div>
              <div className="text-xs opacity-80">
                unlimited queries, all models, cloud sync, priority support
              </div>
            </div>
          </Button>

          {/* Monthly Option */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={() => handleSubscribe(false)}
          >
            <Zap className="h-5 w-5 shrink-0" />
            <div className="text-left flex-1 min-w-0">
              <div className="font-medium">$29/mo</div>
              <div className="text-xs text-muted-foreground">
                unlimited queries, all models, cloud sync, priority support
              </div>
            </div>
          </Button>

          {!isLoggedIn && (reason === "daily_limit" || reason === "rate_limit") && (
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
              <div className="font-medium">
                {reason === "rate_limit" ? "wait a minute" : `wait until ${formatResetTime()}`}
              </div>
              <div className="text-xs text-muted-foreground">
                {reason === "rate_limit"
                  ? "rate limits reset every minute"
                  : "your free queries will reset automatically"}
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
