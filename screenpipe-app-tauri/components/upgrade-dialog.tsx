import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useSettings } from "@/lib/hooks/use-settings";
import { Sparkles, Zap, Clock } from "lucide-react";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: "daily_limit" | "model_not_allowed";
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

  const handleSubscribe = async () => {
    const baseUrl = "https://buy.stripe.com/5kA6p79qefweacg5kJ";
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
      <DialogContent className="w-full max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {reason === "daily_limit"
              ? "you've used all your free queries today"
              : "this model requires an upgrade"}
          </DialogTitle>
          <DialogDescription>
            {reason === "daily_limit"
              ? `your free queries reset ${formatResetTime()}, or upgrade for unlimited access`
              : "upgrade to access smarter models like claude sonnet and gpt-4"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Button
            className="w-full justify-start gap-3 h-auto py-3"
            onClick={handleSubscribe}
          >
            <Zap className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">subscribe for $30/mo</div>
              <div className="text-xs opacity-80">
                unlimited queries, all models, priority support
              </div>
            </div>
          </Button>

          {!isLoggedIn && reason === "daily_limit" && (
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3"
              onClick={handleLogin}
            >
              <Sparkles className="h-5 w-5" />
              <div className="text-left">
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
            <Clock className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">wait until {formatResetTime()}</div>
              <div className="text-xs text-muted-foreground">
                your free queries will reset automatically
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
