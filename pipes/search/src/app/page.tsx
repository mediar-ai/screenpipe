"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useSettings } from "@/lib/hooks/use-settings";
import { Terminal } from "lucide-react";
import { SearchChat } from "@/components/search-chat";


export default function SearchPage() {

  const { settings } = useSettings();
  const aiDisabled = settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;

  return (
    <div className={`flex flex-col gap-4 items-center justify-center h-full ${aiDisabled ? "mt-2" : "mt-12"}`}>
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
      <p className="text-2xl font-bold">where pixels become magic</p>
      <SearchChat />
    </div>
  );
}
