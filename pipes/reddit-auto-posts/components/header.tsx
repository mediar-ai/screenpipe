"use client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useSettings } from "@/lib/hooks/use-settings";
import { Terminal } from "lucide-react";

export default function Header() {

  const { settings } = useSettings();
  const aiDisabled = settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;

  return (
    <div className="flex flex-col justify-center items-center mt-2">
      {aiDisabled &&(
        <Alert className="w-[70%] shadow-sm">
          <Terminal className="h-4 w-4" />
          <AlertTitle>heads up!</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            your ai provider is set to &apos;screenpipe-cloud&apos; and you don&apos;t have logged in <br/>
            please login to use this pipe, go to app &gt; settings &gt; login
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col justify-center items-center">
        <img
          className="w-24 h-24"
          src="/128x128.png"
          alt="screenpipe-logo"
        />
        <h1 className="font-bold text-center text-2xl">screenpipe</h1>
        <h1 className='font-medium text-lg text-center mt-1'>
          get reddit posts recommendation using your screenpipe data
        </h1>
      </div>
    </div>
  );
}
