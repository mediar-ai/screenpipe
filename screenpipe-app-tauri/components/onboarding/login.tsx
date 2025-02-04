import React, { useEffect } from "react";
import { ExternalLinkIcon, UserCog, Coins } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/lib/hooks/use-settings";
import { toast } from "@/components/ui/use-toast";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import OnboardingNavigation from "./navigation";

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

  useEffect(() => {
    const setupDeepLink = async () => {
      const unsubscribeDeepLink = await onOpenUrl(async (urls) => {
        console.log("urls", urls);
        for (const url of urls) {
          if (url.includes("api_key=")) {
            const apiKey = new URL(url).searchParams.get("api_key");
            if (apiKey) {
              updateSettings({ user: { token: apiKey } });
              toast({
                title: "logged in!",
                description: "your api key has been set",
              });
              // handleNextSlide();
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
  }, [settings.user?.token, updateSettings, handleNextSlide]);

  return (
    <div className={`${className} w-full flex justify-center flex-col px-6`}>
      <div className="flex flex-col items-center mb-8">
        <img className="w-24 h-24" src="/128x128.png" alt="screenpipe-logo" />
        <h1 className="text-2xl font-bold mt-4">welcome to screenpipe</h1>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Coins className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">credits & usage</h4>
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
            {settings.user?.credits?.amount || 0} available
          </Badge>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">
            screenpipe api key
          </Label>
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
              onClick={async () => {
                toast({ title: "key verified" });
                handleNextSlide();
              }}
            >
              verify
            </Button>
          </div>
        </div>

        <div className="flex gap-2 justify-center mt-6">
          {settings.user?.token && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => open("https://accounts.screenpi.pe/user")}
              className="hover:bg-secondary/80"
            >
              manage account <UserCog className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => open("https://screenpi.pe/login")}
            className="hover:bg-secondary/80"
          >
            login <ExternalLinkIcon className="w-4 h-4 ml-2" />
          </Button>
          <OnboardingNavigation
            className="mt-6"
            handlePrevSlide={handlePrevSlide}
            handleNextSlide={handleNextSlide}
            prevBtnText="previous"
            nextBtnText="next"
          />
        </div>
      </div>
    </div>
  );
};

export default OnboardingLogin;
