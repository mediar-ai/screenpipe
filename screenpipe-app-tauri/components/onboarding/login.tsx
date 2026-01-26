import React from "react";
import { ExternalLinkIcon, UserCog, CheckCircle2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import { toast } from "@/components/ui/use-toast";
import posthog from "posthog-js";

interface OnboardingLoginProps {
  className?: string;
  handlePrevSlide: () => void;
  handleNextSlide: () => void;
}

const OnboardingLogin: React.FC<OnboardingLoginProps> = ({
  className = "",
  handlePrevSlide,
  handleNextSlide,
}) => {
  const { settings, updateSettings } = useSettings();
  const isLoggedIn = !!settings?.user?.token;

  const handleSkip = () => {
    posthog.capture("onboarding_login_skipped");
    handleNextSlide();
  };

  const handleContinue = () => {
    posthog.capture("onboarding_login_completed", {
      email: settings?.user?.email,
    });
    handleNextSlide();
  };

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center space-y-6 py-4 ${className}`}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold tracking-tight">welcome to screenpipe</h1>
          <p className="text-sm text-muted-foreground">
            100% local. your data never leaves your device.
          </p>
        </div>

        <div className="p-6 border border-border rounded-lg bg-card space-y-4">
          {isLoggedIn ? (
            <>
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4" />
                signed in as {settings?.user?.email}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  onClick={handleContinue}
                  className="w-full"
                >
                  continue
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => open("https://accounts.screenpi.pe/user")}
                  className="w-full text-muted-foreground"
                >
                  manage account <UserCog className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">no account needed to use screenpipe</p>
                <p className="text-xs">
                  optional sign in unlocks: cloud AI, settings sync, priority support
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  variant="default"
                  onClick={handleSkip}
                  className="w-full"
                >
                  continue without account
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => open("https://screenpi.pe/login")}
                  className="w-full text-muted-foreground"
                >
                  sign in (optional) <ExternalLinkIcon className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          your data stays on your device.
        </p>
      </div>
    </div>
  );
};

export default OnboardingLogin;
