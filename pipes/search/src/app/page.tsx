"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSettings } from "@/lib/hooks/use-settings";
import { Terminal } from "lucide-react";
import { SearchChat } from "@/components/search-chat";
import { Sidebar } from "@/components/sidebar";
import { useSearchHistory } from "@/lib/hooks/use-search-history";
import { cn } from "@/lib/utils";

export default function SearchPage() {
  const { settings } = useSettings();
  const { isCollapsed } = useSearchHistory();
  const aiDisabled =
    settings?.aiProviderType === "screenpipe-cloud" && !settings?.user?.token;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main
        className={cn(
          "flex-1 overflow-auto transition-all duration-200",
          !isCollapsed ? "md:ml-80" : "ml-0"
        )}
      >
        <div
          className={`flex flex-col gap-4 items-center px-4 ${
            aiDisabled ? "mt-2" : "mt-12"
          }`}
        >
          {aiDisabled && (
            <Alert className="w-[70%] max-w-2xl shadow-sm">
              <Terminal className="h-4 w-4" />
              <AlertTitle>heads up!</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                your AI provider is set to &apos;screenpipe-cloud&apos;, and you
                aren&apos;t logged in. <br />
                please log in to use this pipe. go to app &gt; settings &gt;
                log in.
              </AlertDescription>
            </Alert>
          )}
          <p className="text-2xl font-bold">search your screen history</p>
          <SearchChat />
        </div>
      </main>
    </div>
  );
}
