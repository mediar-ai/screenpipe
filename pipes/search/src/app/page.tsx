"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSettings } from "@/lib/hooks/use-settings";
import { Terminal } from "lucide-react";
import { SearchChat } from "@/components/search-chat";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export default function SearchPage() {
  const { settings } = useSettings();
  const aiDisabled =
    settings?.aiProviderType === "screenpipe-cloud" && !settings?.user?.token;

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-screen w-full">
        <SearchChat aiDisabled={aiDisabled} />
      </div>
    </SidebarProvider>
  );
}
