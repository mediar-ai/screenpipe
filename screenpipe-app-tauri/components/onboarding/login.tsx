import React from "react";
import { ExternalLinkIcon, UserCog } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks/use-settings";
import { toast } from "@/components/ui/use-toast";
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

  return (
    <div className="w-full h-full flex flex-col items-center justify-center space-y-6 py-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold">login to screenpipe</h1>
          <p className="text-sm text-muted-foreground">
            connect your account to unlock all features
          </p>
        </div>

        <div className="p-6 border border-border/50 rounded-lg bg-background/50">
          <div className="space-y-4">
            {settings.user?.token ? (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                logged in as {settings.user.email}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" />
                not logged in - some features will be limited
              </p>
            )}

            <div className="flex flex-col gap-2">
              {settings.user?.token ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => open("https://accounts.screenpi.pe/user")}
                    className="w-full hover:bg-secondary/80"
                  >
                    manage account <UserCog className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateSettings({ user: { token: undefined } });
                      toast({
                        title: "logged out",
                        description: "you have been logged out",
                      });
                    }}
                    className="w-full hover:bg-secondary/80"
                  >
                    logout <ExternalLinkIcon className="w-4 h-4 ml-2" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => open("https://screenpi.pe/login")}
                  className="w-full hover:bg-secondary/80"
                >
                  login <ExternalLinkIcon className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <OnboardingNavigation
          className="mt-6"
          handlePrevSlide={handlePrevSlide}
          handleNextSlide={handleNextSlide}
          prevBtnText="previous"
          nextBtnText="next"
        />
      </div>
    </div>
  );
};

export default OnboardingLogin;
