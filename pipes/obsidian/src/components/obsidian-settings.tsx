"use client";

import { useState, useEffect, useCallback } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FolderOpen,
  FileCheck,
  Brain,
  Users,
  LineChart,
  Clock,
  ExternalLink,
  LoaderIcon,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OllamaModelsList } from "./ollama-models-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import path from "path";
import { FileSuggestTextarea } from "./file-suggest-textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { debounce } from "lodash";

// This interface represents the shape of obsidian settings
interface ObsidianSettings {
  path: string;
  interval: number;
  pageSize: number;
  aiModel: string;
  prompt: string | null;
}

export function ObsidianSettings() {
  const { settings, updateSettings, loading } = useSettings();
  const [lastLog, setLastLog] = useState<any>(null);
  const { toast } = useToast();
  const [intelligence, setIntelligence] = useState<any>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [logDeepLink, setLogDeepLink] = useState<string | null>(null);
  const [intelligenceDeepLink, setIntelligenceDeepLink] = useState<
    string | null
  >(null);
  console.log("settings", settings);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [testLogLoading, setTestLogLoading] = useState(false);
  const [pathValidation, setPathValidation] = useState<{
    isValid: boolean;
    message: string;
    validatedPath: string | null;
    isChecking: boolean;
  }>({
    isValid: false,
    message: "",
    validatedPath: null,
    isChecking: false,
  });
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([]);

  useEffect(() => {
    if (settings?.customSettings?.obsidian?.prompt) {
      setCustomPrompt(settings.customSettings.obsidian.prompt);
    }
  }, [settings?.customSettings?.obsidian?.prompt]);

  useEffect(() => {
    const fetchPaths = async () => {
      try {
        const res = await fetch("/api/obsidian-paths");
        const data = await res.json();
        setSuggestedPaths(data.paths);
      } catch (err) {
        console.warn("failed to fetch obsidian paths:", err);
      }
    };

    fetchPaths();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const path = formData.get("path") as string;

    if (!path?.trim()) {
      toast({
        variant: "destructive",
        title: "error",
        description: "please set an obsidian vault path",
      });
      return;
    }

    const loadingToast = toast({
      title: "saving settings...",
      description: (
        <div>
          <p>please wait while we update your configuration</p>
          <p>this may take a few minutes</p>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ),
    });

    try {
      const obsidianSettings: ObsidianSettings = {
        path: formData.get("path") as string,
        interval: parseInt(formData.get("interval") as string) * 60000,
        pageSize: parseInt(formData.get("pageSize") as string),
        aiModel: formData.get("aiModel") as string,
        prompt: customPrompt,
      };

      await updateSettings({
        customSettings: {
          obsidian: obsidianSettings,
        },
      });

      loadingToast.update({
        id: loadingToast.id,
        title: "settings saved",
        description: "your obsidian settings have been updated",
      });
    } catch (err) {
      // dismiss loading toast and show error
      loadingToast.update({
        id: loadingToast.id,
        title: "error",
        description: "failed to save settings",
      });
    }
  };

  const testLog = async () => {
    setTestLogLoading(true);
    try {
      const formData = new FormData(
        document.querySelector("form") as HTMLFormElement
      );
      const obsidianSettings: ObsidianSettings = {
        path: formData.get("path") as string,
        interval: parseInt(formData.get("interval") as string) * 60000,
        pageSize: parseInt(formData.get("pageSize") as string),
        aiModel: formData.get("aiModel") as string,
        prompt: customPrompt,
      };

      await updateSettings({
        customSettings: {
          obsidian: obsidianSettings,
        },
      });

      // Then test log generation
      const res = await fetch("/api/log");
      const data = await res.json();
      setLastLog(data);
      setLogDeepLink(data.deepLink);
    } catch (err) {
      console.error("error testing log:", err);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to test log generation",
      });
    } finally {
      setTestLogLoading(false);
    }
  };

  const openPath = async () => {
    try {
      // Check if File System Access API is supported
      if (!("showDirectoryPicker" in window)) {
        toast({
          variant: "destructive",
          title: "error",
          description:
            "your browser doesn't support directory selection. please enter the path manually or try a different browser.",
        });
        return;
      }

      // Open directory picker dialog
      const dirHandle = await (window as any).showDirectoryPicker();
      const path = dirHandle.name;

      // Update the input value and settings
      const input = document.getElementById("path") as HTMLInputElement;
      if (input) {
        input.value = path;
      }

      await updateSettings(
        {
          customSettings: {
            obsidian: {
              ...settings.customSettings?.obsidian,
              path,
            },
          },
        },
        "obsidian"
      );

      toast({
        title: "path updated",
        description: "obsidian vault path has been set",
      });
    } catch (err) {
      console.warn("failed to open directory picker:", err);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to select directory",
      });
    }
  };

  const testIntelligence = async () => {
    setIntelligenceLoading(true);
    try {
      const res = await fetch("/api/intelligence");
      const data = await res.json();
      console.log("data", data);
      setIntelligence(data.intelligence);
      setIntelligenceDeepLink(data.deepLink);

      if (!data.summary.logsAnalyzed) {
        toast({
          variant: "destructive",
          title: "error",
          description: "no logs found for analysis",
        });
        return;
      }

      toast({
        title: "intelligence generated",
        description: `analyzed ${data.summary.logsAnalyzed} logs, found ${data.summary.contacts} contacts`,
      });
    } catch (err) {
      console.warn("error testing intelligence:", err);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to generate intelligence",
      });
    } finally {
      setIntelligenceLoading(false);
    }
  };

  const openObsidianVault = async () => {
    if (!settings.customSettings?.obsidian?.path) return;

    try {
      // Start from the current path and walk up until we find .obsidian folder
      let currentPath = settings.customSettings.obsidian.path;
      let vaultPath = null;

      while (currentPath !== "/") {
        const parentDir = path.dirname(currentPath);
        const hasObsidianFolder = await fetch("/api/check-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: path.join(parentDir, ".obsidian") }),
        })
          .then((r) => r.json())
          .then((r) => r.exists);

        if (hasObsidianFolder) {
          vaultPath = parentDir;
          break;
        }
        currentPath = parentDir;
      }

      if (!vaultPath) {
        toast({
          variant: "destructive",
          title: "error",
          description: "couldn't find obsidian vault root (.obsidian folder)",
        });
        return;
      }

      const vaultName = path.basename(vaultPath);
      // Get relative path from vault root to AI folder
      const relativePath = settings.customSettings.obsidian.path
        .replace(vaultPath, "")
        .replace(/^\//, "");
      const searchQuery = `path:"${relativePath}"`;

      const deepLink = `obsidian://search?vault=${encodeURIComponent(
        vaultName
      )}&query=${encodeURIComponent(searchQuery)}`;

      window.open(deepLink, "_blank");
    } catch (err) {
      console.error("failed to open vault:", err);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to open vault in obsidian",
      });
    }
  };

  // Helper function to check if vault path is set
  const isVaultPathSet = () => {
    return Boolean(settings.customSettings?.obsidian?.path?.trim());
  };

  const validatePath = useCallback(
    debounce(async (inputPath: string) => {
      if (!inputPath?.trim()) {
        setPathValidation({
          isValid: false,
          message: "please enter a path",
          validatedPath: null,
          isChecking: false,
        });
        return;
      }

      setPathValidation((prev) => ({ ...prev, isChecking: true }));

      try {
        // Remove quotes and normalize path separators to forward slashes
        let currentPath = inputPath.replace(/['"]/g, "").replace(/\\/g, "/");
        let foundPath = null;

        // Handle Windows root paths (e.g., C:/)
        const isWindowsPath = /^[a-zA-Z]:\//i.test(currentPath);
        const rootPath = isWindowsPath ? currentPath.slice(0, 3) : "/";

        // First check the input path itself
        const hasObsidianFolder = await fetch("/api/check-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: `${currentPath}/.obsidian` }),
        })
          .then((r) => r.json())
          .then((r) => r.exists);

        if (hasObsidianFolder) {
          foundPath = currentPath;
        } else {
          // If not found, walk up the directory tree
          while (currentPath !== rootPath) {
            const parentDir =
              currentPath.split("/").slice(0, -1).join("/") || rootPath;
            const obsidianPath = `${parentDir}/.obsidian`;

            const hasParentObsidianFolder = await fetch("/api/check-folder", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: obsidianPath }),
            })
              .then((r) => r.json())
              .then((r) => r.exists);

            if (hasParentObsidianFolder) {
              foundPath = parentDir;
              break;
            }
            currentPath = parentDir;
          }
        }

        if (foundPath) {
          setPathValidation({
            isValid: true,
            message: `found obsidian vault at "${foundPath}"`,
            // Store the cleaned path without quotes
            validatedPath: currentPath,
            isChecking: false,
          });
        } else {
          setPathValidation({
            isValid: false,
            message: "no obsidian vault found in path or parent directories",
            validatedPath: null,
            isChecking: false,
          });
        }
      } catch (err) {
        setPathValidation({
          isValid: false,
          message: "error validating path",
          validatedPath: null,
          isChecking: false,
        });
      }
    }, 500),
    []
  );

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <Tabs defaultValue="logs">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="logs">logs</TabsTrigger>
            <TabsTrigger value="intelligence">intelligence (beta)</TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4 w-full my-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-10" />
                <Skeleton className="h-10 w-10" />
              </div>
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-32 w-full" />
            </div>

            <Skeleton className="h-10 w-full" />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <Tabs defaultValue="logs">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="logs">logs</TabsTrigger>
          <TabsTrigger value="intelligence">intelligence (beta)</TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          <form onSubmit={handleSave} className="space-y-4 w-full my-2">
            <div className="space-y-2">
              <Label htmlFor="path">obsidian vault path</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    id="path"
                    name="path"
                    defaultValue={settings.customSettings?.obsidian?.path}
                    placeholder="/path/to/vault"
                    className={`${
                      pathValidation.isValid
                        ? "border-green-500"
                        : pathValidation.message
                        ? "border-red-500"
                        : ""
                    }`}
                    onChange={(e) => validatePath(e.target.value)}
                  />
                  {pathValidation.isChecking && (
                    <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedPaths.map((path) => (
                      <Badge
                        key={path}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => {
                          const input = document.getElementById(
                            "path"
                          ) as HTMLInputElement;
                          if (input) {
                            input.value = path;
                            validatePath(path);
                          }
                        }}
                        title={path}
                      >
                        {path.split(/(\/|\\)/).pop()}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openPath}
                  className="px-3"
                  title="open in file explorer"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openObsidianVault}
                  className="px-3"
                  title="open in obsidian"
                  disabled={!pathValidation.isValid}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              {pathValidation.message && (
                <p
                  className={`text-sm ${
                    pathValidation.isValid ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {pathValidation.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="interval">sync interval (minutes)</Label>
              <Input
                disabled={!pathValidation.isValid}
                id="interval"
                name="interval"
                type="number"
                min="1"
                step="1"
                max="60"
                defaultValue={
                  settings.customSettings?.obsidian?.interval
                    ? settings.customSettings?.obsidian?.interval / 60000
                    : 5
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pageSize">page size</Label>
              <Input
                disabled={!pathValidation.isValid}
                id="pageSize"
                name="pageSize"
                type="number"
                defaultValue={
                  settings.customSettings?.obsidian?.pageSize || 100
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aiModel">ollama/embedded ai model</Label>
              <OllamaModelsList
                disabled={!pathValidation.isValid}
                defaultValue={
                  settings.customSettings?.obsidian?.aiModel ||
                  "llama3.2:3b-instruct-q4_K_M"
                }
                onChange={(value) => {
                  updateSettings({
                    customSettings: {
                      ...settings.customSettings,
                      obsidian: {
                        ...settings.customSettings?.obsidian,
                        aiModel: value,
                      },
                    },
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">custom prompt</Label>
              <FileSuggestTextarea
                value={customPrompt || ""}
                setValue={setCustomPrompt}
                disabled={!pathValidation.isValid}
              />
              <p className="text-xs text-muted-foreground">
                make sure to keep the prompt within llm context window size.
                <br />
                protip: use the @mention feature to link to files in your vault
                as context.
              </p>
            </div>

            <Button
              className="w-full"
              type="submit"
              disabled={!pathValidation.isValid}
            >
              <FileCheck className="mr-2 h-4 w-4" />
              save settings
            </Button>
          </form>

          <div className="space-y-4 w-full flex flex-col">
            <Button
              onClick={testLog}
              variant="outline"
              disabled={testLogLoading || !pathValidation.isValid}
              className="w-full"
            >
              {testLogLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  testing...
                </>
              ) : (
                "test log generation"
              )}
            </Button>

            {lastLog && (
              <div className="p-4 border rounded-lg space-y-2 font-mono text-sm">
                <h4>last generated log:</h4>
                <pre className="bg-muted p-2 rounded overflow-auto">
                  {JSON.stringify(lastLog, null, 2)}
                </pre>
              </div>
            )}

            {lastLog && logDeepLink && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(logDeepLink, "_blank")}
                className="ml-2 my-2"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                open in obsidian
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="intelligence" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">relationship intelligence</h3>
            <Button
              onClick={testIntelligence}
              variant="outline"
              disabled={intelligenceLoading || !pathValidation.isValid}
            >
              <Brain className="mr-2 h-4 w-4" />
              {intelligenceLoading ? "analyzing..." : "analyze relationships"}
            </Button>
          </div>

          {intelligence && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* contacts summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    contacts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {intelligence?.contacts?.length > 0 ? (
                      intelligence.contacts.map((contact: any) => (
                        <div key={contact.name} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{contact.name}</span>
                            <Badge
                              variant={
                                contact.sentiment > 0 ? "default" : "secondary"
                              }
                            >
                              {contact.company || "unknown"}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            last: {contact.lastInteraction}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {contact.topics.map((topic: string) => (
                              <Badge key={topic} variant="outline">
                                {topic}
                              </Badge>
                            ))}
                          </div>
                          {contact.nextSteps.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              next steps: {contact.nextSteps.join(", ")}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground">
                        no contacts found
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* insights */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LineChart className="h-4 w-4" />
                    insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">follow-ups needed</h4>
                      {intelligence.insights.followUps.map((item: string) => (
                        <div
                          key={item}
                          className="text-sm text-muted-foreground"
                        >
                          • {item}
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">opportunities</h4>
                      {intelligence.insights.opportunities.map(
                        (item: string) => (
                          <div
                            key={item}
                            className="text-sm text-muted-foreground"
                          >
                            • {item}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* debug view */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                raw data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs overflow-auto max-h-96">
                {JSON.stringify(intelligence, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {intelligence && intelligenceDeepLink && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(intelligenceDeepLink, "_blank")}
              className="ml-2"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              open in obsidian
            </Button>
          )}
          <div className="my-4 h-16" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
