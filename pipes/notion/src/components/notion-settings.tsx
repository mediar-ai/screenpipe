"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OllamaModelsList } from "./ollama-models-list";
import { validateCredentials } from "@/lib/notion/notion";
import { toast } from "@/hooks/use-toast";
import { useNotionSettings } from "@/lib/hooks/use-pipe-settings";
import { ChevronDown, Loader2 } from "lucide-react";
import { Settings } from "@/lib/types";
import { updatePipeConfig } from "@/lib/actions/update-pipe-config";
import { FileSuggestTextarea } from "./file-suggest-textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { NotionIdInput } from "./notion-url-to-input";
import { INTEGRATION_NAME } from "@/lib/utils";

export function NotionSettings() {
  const { settings, updateSettings, loading } = useNotionSettings();
  const [isSettingUp, setIsSettingUp] = useState(false);

  const [testingLog, setTestingLog] = useState(false);
  const [testingIntelligence, setTestingIntelligence] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<Settings> | null>(
    {},
  );

  useEffect(() => {
    setLocalSettings({
      ...settings,
    });
  }, [settings]);

  const handleValidate = async () => {
    setIsSettingUp(true);
    try {
      const isValid = await validateCredentials({
        accessToken: settings?.notion?.accessToken || "",
        databaseId: settings?.notion?.databaseId || "",
        intelligenceDbId: settings?.notion?.intelligenceDbId || "",
      });
      if (!isValid) {
        throw new Error("Invalid credentials");
      }

      await updateSettings({
        ...settings!,
        notion: {
          accessToken: settings?.notion?.accessToken || "",
          databaseId: settings?.notion?.databaseId || "",
          intelligenceDbId: settings?.notion?.intelligenceDbId || "",
        },
      });

      toast({
        title: "Success",
        description: "Notion connected successfully",
      });
    } catch (_error) {
      toast({
        title: "Error",
        description:
          "Failed to connect to Notion, make sure your integration have to databases",
        variant: "destructive",
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      const response = await fetch("/api/setup");
      const credentials = await response.json();

      if (!response.ok) throw new Error(credentials.error);

      const notionCreds = {
        accessToken: credentials.accessToken,
        databaseId: credentials.databaseId,
        intelligenceDbId: credentials.intelligenceDbId,
      };

      const isValid = await validateCredentials(notionCreds);
      if (!isValid) {
        throw new Error("Invalid credentials");
      }

      console.log(isValid, "done");

      await updateSettings({
        ...settings!,
        notion: notionCreds,
      });

      toast({
        title: "Success",
        description: "Notion connected successfully",
      });
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to connect to Notion",
        variant: "destructive",
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleTestLog = async () => {
    setTestingLog(true);
    try {
      const response = await fetch("/api/log");

      const data = await response.json();

      console.log(data);
      if (!response.ok) throw new Error(data.message);

      toast({
        title: "Success",
        description: `Log created successfully. View at: ${data.deepLink}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create log",
        variant: "destructive",
      });
    } finally {
      setTestingLog(false);
    }
  };

  const handleTestIntelligence = async () => {
    setTestingIntelligence(true);
    try {
      const response = await fetch("/api/intelligence");
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      toast({
        title: "Success",
        description: `Intelligence generated with ${data.summary.contacts} contacts`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to generate intelligence",
        variant: "destructive",
      });
    } finally {
      setTestingIntelligence(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateSettings({
        ...settings!,
        aiModel: localSettings?.aiModel || settings?.aiModel,
        prompt: localSettings?.prompt || settings?.prompt,
        interval: localSettings?.interval || settings?.interval,
        pageSize: localSettings?.pageSize || settings?.pageSize,
        workspace: localSettings?.workspace || settings?.workspace,
        notion: {
          accessToken:
            localSettings?.notion?.accessToken ||
            settings?.notion?.accessToken ||
            "",
          databaseId:
            localSettings?.notion?.databaseId ||
            settings?.notion?.databaseId ||
            "",
          intelligenceDbId:
            localSettings?.notion?.intelligenceDbId ||
            settings?.notion?.intelligenceDbId ||
            "",
        },
      });

      if (localSettings?.interval !== settings?.interval) {
        await updatePipeConfig(localSettings?.interval || 5);
      }

      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full max-w-4xl ">
      <CardHeader>
        <CardTitle>Notion Settings</CardTitle>
        <CardDescription>
          please have chrome install for connecting with notion automatically{" "}
          <br />
          otherwise you can set it up manually, then click on manual button in
          Connect Notion Dropdown menu if you have setup automatically then the
          integration will be {INTEGRATION_NAME}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label>AI Model</Label>
              <OllamaModelsList
                defaultValue={settings?.aiModel || ""}
                onChange={(model) => {
                  setLocalSettings({ ...localSettings!, aiModel: model });
                }}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label>Custom Prompt</Label>
              <FileSuggestTextarea
                value={localSettings?.prompt || settings?.prompt || ""}
                setValue={(value) => {
                  setLocalSettings({ ...localSettings!, prompt: value });
                }}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                make sure to keep the prompt within llm context window size.
                <br />
                protip: use the @mention feature to link to other pages in your
                notion as context.
                <br />
                <br />
                <strong>
                  (make sure these pages are shared with the integration)
                </strong>
                <br />
                <br />
                if you have connected with notion automatically, then your
                integration name will{" "}
                <span className="text-red-400">{INTEGRATION_NAME}</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interval">sync interval (minutes)</Label>
              <Input
                id="interval"
                name="interval"
                type="number"
                min="1"
                step="1"
                max="60"
                defaultValue={settings?.interval ? settings?.interval : 5}
                onChange={(e) => {
                  setLocalSettings({
                    ...localSettings!,
                    interval: parseInt(e.target.value),
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Workspace Name</Label>
              <Input
                type="text"
                placeholder="Required"
                value={settings?.workspace || ""}
                onChange={(e) =>
                  updateSettings({ ...settings!, workspace: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                this is required when you are connecting automatically. you can
                find your workspace name{" "}
                <a
                  href="https://www.notion.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline"
                >
                  here
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pageSize">Page size</Label>
              <Input
                id="pageSize"
                name="pageSize"
                type="number"
                defaultValue={settings?.pageSize || 50}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings!,
                    pageSize: parseInt(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>
                Access Token{" "}
                <span className="text-xs text-muted-foreground">
                  (found in your integration page)
                </span>
              </Label>
              <Input
                placeholder="Access Token"
                value={localSettings?.notion?.accessToken || ""}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings!,
                    notion: {
                      databaseId: localSettings?.notion?.databaseId || "",
                      intelligenceDbId:
                        localSettings?.notion?.intelligenceDbId || "",
                      accessToken: e.target.value,
                    },
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                you can create integration{" "}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  className="text-blue-400 underline"
                >
                  {" "}
                  here
                </a>{" "}
                if you want to do it manually
              </p>
            </div>
            <div className="space-y-2">
              <NotionIdInput
                label="Database ID"
                value={localSettings?.notion?.databaseId || ""}
                onChange={(value) =>
                  setLocalSettings({
                    ...localSettings!,
                    notion: {
                      accessToken: localSettings?.notion?.accessToken || "",
                      intelligenceDbId:
                        localSettings?.notion?.intelligenceDbId || "",
                      databaseId: value,
                    },
                  })
                }
                dialogTitle="Extract Database ID from URL"
              />
            </div>
            <div className="space-y-2">
              <NotionIdInput
                label="Intelligence ID"
                value={localSettings?.notion?.intelligenceDbId || ""}
                onChange={(value) =>
                  setLocalSettings({
                    ...localSettings!,
                    notion: {
                      accessToken: localSettings?.notion?.accessToken || "",
                      databaseId: localSettings?.notion?.databaseId || "",
                      intelligenceDbId: value,
                    },
                  })
                }
                dialogTitle="Extract Intelligence Database ID from URL"
              />
            </div>

            <div className="flex justify-between items-center">
              <div className="flex gap-5 items-center">
                <NotionConnectButton
                  isAutoDisabled={isSettingUp || !settings?.workspace}
                  isManualDisabled={
                    isSettingUp ||
                    !localSettings?.notion?.accessToken ||
                    !localSettings?.notion?.databaseId ||
                    !localSettings?.notion?.intelligenceDbId
                  }
                  handleAuto={handleSetup}
                  handleManual={handleValidate}
                  isLoading={isSettingUp}
                />
              </div>
              {settings?.notion && (
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleTestLog}
                    disabled={testingLog}
                    variant="secondary"
                  >
                    {testingLog ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing Log
                      </>
                    ) : (
                      "Test Log"
                    )}
                  </Button>

                  <Button
                    onClick={handleTestIntelligence}
                    disabled={testingIntelligence}
                    variant="secondary"
                  >
                    {testingIntelligence ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing
                      </>
                    ) : (
                      "Test Intelligence"
                    )}
                  </Button>
                </div>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleSaveSettings}
                      disabled={loading}
                      variant="outline"
                    >
                      Save Settings
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Saves AI model, prompt, interval, and page size settings
                      only
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const NotionConnectButton = ({
  isAutoDisabled,
  isManualDisabled,
  isLoading,
  handleAuto,
  handleManual,
}: {
  isAutoDisabled: boolean;
  isManualDisabled: boolean;
  handleAuto: () => void;
  handleManual: () => void;
  isLoading: boolean;
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isLoading} className="group">
          {isLoading ? "Connecting..." : "Connect Notion"}
          <ChevronDown className="group-aria-expanded:rotate-180 transition duration-200" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleAuto} disabled={isAutoDisabled}>
          Automatic
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleManual} disabled={isManualDisabled}>
          Manual
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
