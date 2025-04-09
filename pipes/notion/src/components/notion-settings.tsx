"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { validateCredentials } from "@/lib/notion/notion";
import { toast } from "@/hooks/use-toast";
import { usePipeSettings } from "@/lib/hooks/use-pipe-settings";
import { ChevronDown, Loader2, ExternalLink, Info, Clock, Brain, LineChart } from "lucide-react";
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
import { NotionDatabaseSelector, NotionIdInput } from "./notion-url-to-input";
import { INTEGRATION_NAME } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PipeSettings } from "@/lib/store/settings-store";
import { AIPresetsSelector } from "./ai-presets-selector";
import {
  Separator
} from "./ui/separator";
import { Switch } from "./ui/switch";

export function NotionSettings() {
  const { settings, updateSettings, loading } = usePipeSettings("notion");
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [testingLog, setTestingLog] = useState(false);
  const [testingIntelligence, setTestingIntelligence] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<PipeSettings> | null>({});
  const [isConnectedToNotion, setIsConnectedToNotion] = useState<boolean | null>(null);
  const [deduplicationEnabled, setDeduplicationEnabled] =
  useState<boolean>(false);
  const [checkingModel, setCheckingModel] = useState<boolean>(false);

  useEffect(() => {
    setLocalSettings({
      ...settings,
    });
  }, [settings]);

  const handleValidate = async () => {
    console.log("handleValidate", settings?.notion);
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
        shortTasksInterval: localSettings?.shortTasksInterval || settings?.shortTasksInterval,
        pageSize: localSettings?.pageSize || settings?.pageSize,
        workspace: localSettings?.workspace || settings?.workspace,
        deduplicationEnabled: localSettings?.deduplicationEnabled || settings?.deduplicationEnabled,
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

      if (localSettings?.shortTasksInterval !== settings?.shortTasksInterval) {
        await updatePipeConfig(localSettings?.shortTasksInterval || 5, "/api/log", "minute");
      }

      if (localSettings?.interval !== settings?.interval) {
        await updatePipeConfig(localSettings?.interval || 1, "/api/intelligence", "hour");
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

  // Check if the connection is complete
  const isConnected = !!(
    settings?.notion?.accessToken &&
    settings?.notion?.databaseId &&
    settings?.notion?.intelligenceDbId
  );


  
  useEffect(() => {
    const checkConnection = async () => {
      if (!settings?.notion?.accessToken || 
          !settings?.notion?.databaseId || 
          !settings?.notion?.intelligenceDbId) {
        setIsConnectedToNotion(false);
        return;
      }
      
      try {
        console.log("Checking connection...");
        setIsConnectedToNotion(null);
        const isValid = await validateCredentials({
          accessToken: settings.notion.accessToken,
          databaseId: settings.notion.databaseId,
          intelligenceDbId: settings.notion.intelligenceDbId,
        });
        setIsConnectedToNotion(isValid);
      } catch (error) {
        console.error("Failed to validate Notion credentials:", error);
        setIsConnectedToNotion(false);
      }
    };
    
    checkConnection();
  }, [settings?.notion?.accessToken, settings?.notion?.databaseId, settings?.notion?.intelligenceDbId]);

  // Check if manual connection is ready
  const isManualConnectionReady = !!(
    localSettings?.notion?.accessToken &&
    localSettings?.notion?.databaseId &&
    localSettings?.notion?.intelligenceDbId
  );


  // Replace the connection status indicator with an improved version
  const renderConnectionStatus = () => {
    if (isConnectedToNotion === null) {
      return (
        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md text-blue-700 dark:text-blue-300 text-sm flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking connection status...
        </div>
      );
    } else if (isConnectedToNotion) {
      return (
        <div className="mt-2 p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          Connected to Notion successfully
        </div>
      );
    } else if (!isConnectedToNotion && settings?.notion?.accessToken) {
      return (
        <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500"></div>
          Failed to connect to Notion
        </div>
      );
    } else {
      return (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md text-yellow-700 dark:text-yellow-300 text-sm flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
          Not connected to Notion yet
        </div>
      );
    }
  };

  const setupDeduplication = async () => {
    setCheckingModel(true);
    try {
      // Direct request to Ollama API
      const checkRes = await fetch("http://localhost:11434/api/tags");
      const models = await checkRes.json();

      const hasEmbeddingModel = models.models?.some(
        (m: { name: string }) => m.name === "nomic-embed-text",
      );

      if (!hasEmbeddingModel) {
        // Show loading toast
        const loadingToast = toast({
          title: "pulling embedding model...",
          description: (
            <div>
              <p>downloading nomic-embed-text model</p>
              <p>this may take a few minutes</p>
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ),
        });

        // Direct pull request to Ollama
        const pullRes = await fetch("http://localhost:11434/api/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "nomic-embed-text" }),
        });

        if (!pullRes.ok) {
          throw new Error("failed to pull model");
        }

        // Handle streaming response
        const reader = pullRes.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("no response body");
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            const response = JSON.parse(line);
            console.log("progress:", response);

            // Update toast with progress if available
            if (response.total && response.completed) {
              const progress = Math.round(
                (response.completed / response.total) * 100,
              );
              loadingToast.update({
                id: loadingToast.id,
                title: "pulling embedding model...",
                description: (
                  <div>
                    <p>downloading nomic-embed-text model: {progress}%</p>
                    <p>{response.status}</p>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ),
              });
            }
          }
        }

        loadingToast.update({
          id: loadingToast.id,
          title: "model ready",
          description: "embedding model has been downloaded",
        });
      }

      setDeduplicationEnabled(true);
      await updateSettings({
        ...settings!,
        deduplicationEnabled: true,
      });

      toast({
        title: "deduplication enabled",
        description: "content will be deduplicated before processing",
      });
    } catch (error) {
      console.error("error setting up deduplication:", error);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to setup deduplication",
      });
      setDeduplicationEnabled(false);
    } finally {
      setCheckingModel(false);
    }
  };

    // Add this useEffect to initialize the state from settings
    useEffect(() => {
      if (settings) {
        setDeduplicationEnabled(settings?.deduplicationEnabled || false);
      }
    }, [settings?.deduplicationEnabled]);


  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center">
          <img 
            src="https://img.icons8.com/?size=100&id=o1a4zZIDo6W0&format=png&color=000000" 
            alt="Notion" 
            className="h-6 w-6 mr-2" 
            onError={(e) => e.currentTarget.style.display = 'none'} 
          />
          Notion Settings
        </CardTitle>
        <CardDescription>
          Configure your Notion integration to start syncing content
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="connection" className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="connection" className="font-medium">
              Connection
            </TabsTrigger>
            <TabsTrigger value="ai" className="font-medium">
              AI & Prompts
            </TabsTrigger>
            <TabsTrigger value="sync" className="font-medium">
              Sync Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connection" className="space-y-4 px-5">
            <div className="space-y-2">
              <Label htmlFor="workspace">Workspace Name</Label>
              <Input
                id="workspace"
                type="text"
                placeholder="Required"
                value={settings?.workspace || ""}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings!,
                    workspace: e.target.value,
                  })
                }
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Required for automatic connection. Visit{" "}
                <a
                  href="https://www.notion.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline flex items-center"
                >
                  Notion <ExternalLink className="h-3 w-3 ml-0.5" />
                </a>
                {" "}to find your workspace name.
              </p>
            </div>

            <Accordion type="single" collapsible defaultValue="credentials">
              <AccordionItem value="credentials">
                <AccordionTrigger>Connection Details</AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>
                      Access Token{" "}
                      <span className="text-xs text-muted-foreground">
                        (from your integration page)
                      </span>
                    </Label>
                    <Input
                      placeholder="Access Token"
                      value={localSettings?.notion?.accessToken || ""}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings!,
                          notion: {
                            ...localSettings?.notion,
                            accessToken: e.target.value,
                            databaseId: localSettings?.notion?.databaseId || "",
                            intelligenceDbId: localSettings?.notion?.intelligenceDbId || "",
                          },
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Create a Notion integration{" "}
                      <a
                        href="https://www.notion.so/my-integrations"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 underline flex items-center"
                      >
                        here <ExternalLink className="h-3 w-3 ml-0.5" />
                      </a>
                    </p>
                  </div>
                  
                    {
                      localSettings?.notion?.accessToken && (
                        <>
                  <div className="space-y-2">
                      <NotionDatabaseSelector
                      accessToken={localSettings?.notion?.accessToken || ""}
                      label="Database ID"
                      value={localSettings?.notion?.databaseId || ""}
                      onChange={(value) =>
                        setLocalSettings({
                          ...localSettings!,
                          notion: {
                            ...localSettings?.notion,
                            databaseId: value,
                            accessToken: localSettings?.notion?.accessToken || "",
                            intelligenceDbId: localSettings?.notion?.intelligenceDbId || "",
                          },
                        })
                      }
                        />
                  </div>
                  
                  <div className="space-y-2">
                    <NotionDatabaseSelector
                      accessToken={localSettings?.notion?.accessToken || ""}
                      label="Intelligence ID"
                      value={localSettings?.notion?.intelligenceDbId || ""}
                      onChange={(value) =>
                        setLocalSettings({
                          ...localSettings!,
                          notion: {
                            ...localSettings?.notion,
                            intelligenceDbId: value,
                            accessToken: localSettings?.notion?.accessToken || "",
                            databaseId: localSettings?.notion?.databaseId || "",
                          },
                        })
                      }
                    />
                  </div>
                  </>
                )
                }
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mt-6">
              <NotionConnectButton
                isAutoDisabled={isSettingUp || !settings?.workspace}
                isManualDisabled={isSettingUp || !isManualConnectionReady}
                handleAuto={handleSetup}
                handleManual={handleValidate}
                isLoading={isSettingUp}
              />

              {isConnected && (
                <div className="flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleTestLog}
                          disabled={testingLog}
                          variant="secondary"
                          size="sm"
                        >
                          {testingLog ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Testing
                            </>
                          ) : (
                            "Test Log"
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Create a test log entry in your Notion database</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleTestIntelligence}
                          disabled={testingIntelligence}
                          variant="secondary"
                          size="sm"
                        >
                          {testingIntelligence ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Analyzing
                            </>
                          ) : (
                            "Test Intelligence"
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Test the intelligence generation functionality</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
            
              {renderConnectionStatus()}
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-medium">AI Models</h3>
                </div>
                
                <div className="space-y-4 p-4 bg-card rounded-lg border shadow-sm">
                  <h4 className="text-sm font-medium">Intelligence (Long-term)</h4>
                  <AIPresetsSelector 
                    pipeName="notion" 
                    aiKey="aiPresetId"
                  />
                  <p className="text-xs text-muted-foreground">
                    Select an AI model preset for intelligence generation
                  </p>
                </div>
                
                <div className="space-y-4 p-4 bg-card rounded-lg border shadow-sm">
                  <h4 className="text-sm font-medium">Logs (Short-term)</h4>
                  <AIPresetsSelector 
                    pipeName="notion" 
                    aiKey="aiLogPresetId"
                  />
                  <p className="text-xs text-muted-foreground">
                    Select an AI model preset for daily log generation
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 gap-6">
                {/* Custom Prompt Section */}
                <div className="space-y-4 col-span-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <h3 className="text-base font-medium">Custom Prompt</h3>
                  </div>
                  
                  <div className="space-y-2 bg-muted/40 p-4 rounded-lg">
                    <Label>Custom Prompt</Label>
                    <FileSuggestTextarea
                      value={localSettings?.prompt || settings?.prompt || ""}
                      setValue={(value) => {
                        setLocalSettings({ 
                          ...localSettings!, 
                          prompt: value
                        });
                      }}
                      disabled={loading}
                      placeholder="Enter a prompt for generating daily logs (short tasks)"
                    />
                    <div className="text-xs text-muted-foreground p-2 bg-muted rounded-md mt-2">
                      <p className="font-medium mb-1">Tips for log prompts:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Keep prompts concise for daily activity logs</li>
                        <li>Focus on capturing key activities and time tracking</li>
                        <li>Ideal for short, frequent updates</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sync" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interval">Sync Interval (long-term) (hours)</Label>
                <Input
                  id="interval"
                  name="interval"
                  type="number"
                  min="1"
                  step="1"
                  max="24"
                  defaultValue={settings?.interval ? settings?.interval : 5}
                  onChange={(e) => {
                    setLocalSettings({
                      ...localSettings!,
                      interval: parseInt(e.target.value) || 1,
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  How often to sync with Notion (1-60 minutes)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pageSize">Page Size</Label>
                <Input
                  id="pageSize"
                  name="pageSize"
                  type="number"
                  defaultValue={settings?.pageSize || 50}
                  min="10"
                  max="100"
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings!,
                      pageSize: parseInt(e.target.value) || 50,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Number of items to fetch per sync (10-100)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shortTasksInterval"> Sync Interval (short-term) (minutes)</Label>
                <Input
                  id="shortTasksInterval"
                  name="shortTasksInterval"
                  type="number"
                  min="1"
                  step="1"
                  max="60"
                  defaultValue={settings?.shortTasksInterval || 5}
                  onChange={(e) => {
                    setLocalSettings({
                      ...localSettings!,
                      shortTasksInterval: parseInt(e.target.value) || 1,
                    });
                  }}
                />
              </div>

              <div className="flex flex-col space-x-2 space-y-2">
                    <div className="flex items-center space-x-2 pt-5">
                      <Switch
                        id="deduplication"
                        checked={deduplicationEnabled}
                        disabled={checkingModel || !Boolean(isConnectedToNotion)}
                        onCheckedChange={async (checked) => {
                          if (checked) {
                            await setupDeduplication();
                          } else {
                            setDeduplicationEnabled(false);
                            await updateSettings({
                              ...settings!,
                              deduplicationEnabled: false,
                            });
                          }
                        }}
                      />
                      <Label htmlFor="deduplication" className="text-sm">
                        {checkingModel ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            downloading model...
                          </span>
                        ) : (
                          "deduplicate similar content before processing"
                        )}
                      </Label>

                    </div>
                    <p className="text-xs text-muted-foreground">
                      uses embeddings to remove duplicate content, it will
                      download the <code>nomic-embed-text</code> model if it is
                      not already downloaded
                    </p>
                    </div>

            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      
      <CardFooter className="flex justify-end border-t p-4 mt-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleSaveSettings}
                disabled={loading}
                className="min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Save all current settings</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
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
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              Connect Notion
              <ChevronDown className="ml-2 h-4 w-4 group-aria-expanded:rotate-180 transition duration-200" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem 
          onClick={handleAuto} 
          disabled={isAutoDisabled}
          className={isAutoDisabled ? "opacity-50 cursor-not-allowed" : ""}
        >
          Automatic

        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleManual} 
          disabled={isManualDisabled}
          className={isManualDisabled ? "opacity-50 cursor-not-allowed" : ""}
        >
          Manual
          <span className="text-xs ml-2 text-muted-foreground">(Recommended)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
