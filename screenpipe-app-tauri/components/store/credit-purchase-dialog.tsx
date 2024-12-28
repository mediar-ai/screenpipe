import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useUser } from "@/lib/hooks/use-user";
import { Loader2 } from "lucide-react";

interface CreditPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredCredits: number;
  currentCredits: number;
  onCreditsUpdated?: () => void;
}

export function CreditPurchaseDialog({
  open,
  onOpenChange,
  requiredCredits,
  currentCredits,
  onCreditsUpdated,
}: CreditPurchaseDialogProps) {
  const { refreshUser, user } = useUser();
  const [showRefreshHint, setShowRefreshHint] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handlePurchase = async (url: string) => {
    setIsLoading(true);
    await openUrl(
      `${url}?client_reference_id=${user?.id}&metadata[user_id]=${user?.id}`
    );
    setTimeout(async () => {
      await refreshUser();
      onCreditsUpdated?.();
      setShowRefreshHint(true);
      setIsLoading(false);
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[650px]">
        <DialogHeader>
          <DialogTitle>insufficient credits</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            you need {requiredCredits} credits but only have {currentCredits}
          </p>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
              <div className="flex flex-col space-y-1.5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="px-1.5 text-xs">
                      monthly
                    </Badge>
                    <span className="text-sm font-mono">
                      15 credits/m, unlimited screenpipe cloud, priority support
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handlePurchase(
                        `https://buy.stripe.com/5kA6p79qefweacg5kJ?client_reference_id=${user?.id}&customer_email=${encodeURIComponent(user?.email ?? '')}`
                      )
                    }
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
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
                      handlePurchase(
                        `https://buy.stripe.com/eVaeVD45UbfYeswcNd?client_reference_id=${user?.id}&customer_email=${encodeURIComponent(user?.email ?? '')}`
                      )
                    }
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    $50
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {showRefreshHint && (
            <p className="text-xs text-muted-foreground">
              if credits not updating, please refresh page
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
