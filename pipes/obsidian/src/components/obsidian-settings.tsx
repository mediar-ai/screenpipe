"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FolderOpen,
  FileCheck,
  Brain,
  LineChart,
  Clock,
  ExternalLink,
  Loader2,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OllamaModelsList } from "./ollama-models-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import path from "path";
import { FileSuggestTextarea } from "./file-suggest-textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { debounce } from "lodash";
import { updatePipeConfig } from "@/lib/actions/update-pipe-config";
import { usePipeSettings } from "@/lib/hooks/use-pipe-settings";
import { MemoizedReactMarkdown } from "./markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./ui/codeblock";
import { VideoComponent } from "./video";
import { Switch } from "@/components/ui/switch";

export function ObsidianSettings() {
  const { settings, updateSettings, loading } = usePipeSettings();
  const [lastLog, setLastLog] = useState<any>(null);
  const { toast } = useToast();
  const [intelligence, setIntelligence] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);

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
  const [deduplicationEnabled, setDeduplicationEnabled] =
    useState<boolean>(false);
  const [checkingModel, setCheckingModel] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setCustomPrompt(settings.prompt || "");
    }
  }, [settings]);

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
    const vaultPath = formData.get("vaultPath") as string;

    if (!vaultPath?.trim()) {
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
      const vaultPath = formData.get("vaultPath") as string;
      const logTimeWindow =
        parseInt(formData.get("logTimeWindow") as string) * 60000;
      const analysisTimeWindow =
        parseInt(formData.get("analysisTimeWindow") as string) * 60 * 60 * 1000;

      const logPageSize = parseInt(formData.get("logPageSize") as string);

      const obsidianSettings = {
        vaultPath,
        logTimeWindow,
        logPageSize,
        prompt: customPrompt || "",
        analysisTimeWindow,
      };

      await updateSettings({
        ...settings!,
        ...obsidianSettings,
      });
      await updatePipeConfig(logTimeWindow / 60000);

      loadingToast.update({
        id: loadingToast.id,
        title: "settings saved",
        description: "your obsidian settings have been updated",
      });
    } catch (err) {
      console.warn("error saving settings:", err);
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
      // Then test log generation
      const res = await fetch("/api/log");
      const data = await res.json();
      setLastLog(data);
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
      const input = document.getElementById("vaultPath") as HTMLInputElement;
      if (input) {
        input.value = path;
      }

      await updateSettings({
        ...settings!,
        vaultPath: path,
      });

      toast({
        title: "vault path updated",
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
      setIntelligence(data.intelligence);

      if (!data.summary.logsAnalyzed) {
        toast({
          variant: "destructive",
          title: "error",
          description: "no logs found for analysis",
        });
        return;
      }

      toast({
        title: "analysis complete",
        description: `analyzed ${data.summary.logsAnalyzed} logs`,
      });
    } catch (err) {
      console.warn("error testing analysis:", err);
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to generate analysis",
      });
    } finally {
      setIntelligenceLoading(false);
    }
  };

  const openObsidianVault = async () => {
    if (!settings?.vaultPath) return;

    try {
      // Start from the current path and walk up until we find .obsidian folder
      let currentPath = settings.vaultPath;
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
      const relativePath = settings.vaultPath
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

  // Add this new useEffect for initial path validation
  useEffect(() => {
    if (settings?.vaultPath) {
      validatePath(settings.vaultPath);
    }
  }, [settings?.vaultPath, validatePath]);

  const setupDeduplication = async () => {
    setCheckingModel(true);
    try {
      // Direct request to Ollama API
      const checkRes = await fetch("http://localhost:11434/api/tags");
      const models = await checkRes.json();

      const hasEmbeddingModel = models.models?.some(
        (m: { name: string }) => m.name === "nomic-embed-text"
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
                (response.completed / response.total) * 100
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
      setDeduplicationEnabled(settings.deduplicationEnabled || false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <form onSubmit={handleSave} className="space-y-4 w-full my-2">
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
        </form>
      </div>
    );
  }
  const hasMP4File = (content: string) =>
    content.trim().toLowerCase().includes(".mp4");
  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>obsidian settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="vaultPath" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                obsidian vault path (this is the folder where we will save the
                logs and insights)
              </Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    id="vaultPath"
                    name="vaultPath"
                    defaultValue={settings?.vaultPath}
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
                            "vaultPath"
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
                  title="open in obsidian (only works in browser)"
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
              <Card>
                <CardHeader>
                  <CardTitle>short-term activity logs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label
                      htmlFor="deduplication"
                      className="flex items-center gap-2"
                    >
                      <LineChart className="h-4 w-4" />
                      content deduplication
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="deduplication"
                        checked={deduplicationEnabled}
                        disabled={checkingModel || !pathValidation.isValid}
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

                  <div className="space-y-2">
                    <Label
                      htmlFor="logTimeWindow"
                      className="flex items-center gap-2"
                    >
                      <Clock className="h-4 w-4" />
                      logging interval (minutes)
                    </Label>
                    <Input
                      disabled={!pathValidation.isValid}
                      id="logTimeWindow"
                      name="logTimeWindow"
                      type="number"
                      min="1"
                      step="1"
                      max="60"
                      defaultValue={
                        settings?.logTimeWindow
                          ? settings?.logTimeWindow / 60000
                          : 5
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      how often screenpipe will create a new log entry about
                      your activity
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="logPageSize"
                      className="flex items-center gap-2"
                    >
                      <LineChart className="h-4 w-4" />
                      screenpipe page size
                    </Label>
                    <Input
                      disabled={!pathValidation.isValid}
                      id="logPageSize"
                      name="logPageSize"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={settings?.logPageSize || 100}
                    />
                    <p className="text-xs text-muted-foreground">
                      how many screenpipe results to include in the AI prompt
                      for log generation
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="logModel"
                      className="flex items-center gap-2"
                    >
                      <Brain className="h-4 w-4" />
                      log generation model
                      <code className="px-2 py-0.5 bg-muted rounded-md text-xs flex items-center gap-2">
                        ollama run{" "}
                        {settings?.logModel || "llama3.2:3b-instruct-q4_K_M"}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `ollama run ${
                                settings?.logModel ||
                                "llama3.2:3b-instruct-q4_K_M"
                              }`
                            );
                            toast({
                              title: "copied to clipboard",
                              duration: 1000,
                            });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </code>
                    </Label>
                    <OllamaModelsList
                      disabled={!pathValidation.isValid}
                      defaultValue={
                        settings?.logModel || "llama3.2:3b-instruct-q4_K_M"
                      }
                      onChange={(value) => {
                        updateSettings({
                          ...settings,
                          logModel: value,
                        });
                      }}
                    />
                    {settings?.logModel &&
                      (settings.logModel.includes("deepseek") ||
                        settings.logModel.includes("o3") ||
                        settings.logModel.includes("o1")) && (
                        <p className="text-sm text-red-500">
                          warning: reasoning models like deepseek are not
                          recommended for log generation.
                        </p>
                      )}
                    <p className="text-xs text-muted-foreground">
                      local AI model used for generating individual activity
                      logs
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>long-term analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label
                      htmlFor="analysisWindow"
                      className="flex items-center gap-2"
                    >
                      <Clock className="h-4 w-4" />
                      analysis window (hours)
                    </Label>
                    <Input
                      disabled={!pathValidation.isValid}
                      id="analysisWindow"
                      name="analysisTimeWindow"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={
                        settings?.analysisTimeWindow
                          ? settings.analysisTimeWindow / (60 * 60 * 1000)
                          : 1
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      timeframe of logs to analyze for generating insights
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="analysisModel"
                      className="flex items-center gap-2"
                    >
                      <Brain className="h-4 w-4" />
                      analysis model
                      <code className="px-2 py-0.5 bg-muted rounded-md text-xs flex items-center gap-2">
                        ollama run{" "}
                        {settings?.analysisModel ||
                          "deepseek-r1:7b-qwen-distill-q4_K_M"}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `ollama run ${
                                settings?.analysisModel ||
                                "deepseek-r1:7b-qwen-distill-q4_K_M"
                              }`
                            );
                            toast({
                              title: "copied to clipboard",
                              duration: 1000,
                            });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </code>
                    </Label>
                    <OllamaModelsList
                      disabled={!pathValidation.isValid}
                      defaultValue={
                        settings?.analysisModel ||
                        "deepseek-r1:7b-qwen-distill-q4_K_M"
                      }
                      onChange={(value) => {
                        updateSettings({
                          ...settings,
                          analysisModel: value,
                        });
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      local AI model used for generating high-level insights
                      (typically larger model)
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>prompt customization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label htmlFor="prompt" className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      custom prompt
                    </Label>
                    <FileSuggestTextarea
                      value={customPrompt || ""}
                      setValue={setCustomPrompt}
                      disabled={!pathValidation.isValid}
                    />
                    <p className="text-xs text-muted-foreground">
                      customize how activity logs and insights are generated
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 w-full flex flex-col">
          <div className="flex gap-2 mt-4">
            <Button
              type="button"
              onClick={testLog}
              variant="outline"
              disabled={
                testLogLoading || !pathValidation.isValid || !settings?.logModel
              }
              className="flex-1"
            >
              {testLogLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  testing...
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  test log generation
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={testIntelligence}
              variant="outline"
              disabled={
                intelligenceLoading ||
                !pathValidation.isValid ||
                !settings?.analysisModel
              }
              className="flex-1"
            >
              <Brain className="mr-2 h-4 w-4" />
              {intelligenceLoading ? "analyzing..." : "test analyze activity"}
            </Button>

            <Button
              type="submit"
              disabled={!pathValidation.isValid}
              className="flex-1"
            >
              <FileCheck className="mr-2 h-4 w-4" />
              save settings
            </Button>
          </div>

          {lastLog && (
            <div className="p-4 border rounded-lg space-y-2">
              <h4 className="font-mono text-sm">last log:</h4>
              <div className="bg-muted p-2 rounded overflow-auto">
                <MemoizedReactMarkdown
                  className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0"
                  remarkPlugins={[remarkGfm, remarkMath]}
                  components={{
                    p({ children }) {
                      return <p className="mb-2 last:mb-0">{children}</p>;
                    },
                    a({ node, href, children, ...props }) {
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                    code({ node, className, children, ...props }) {
                      const content = String(children).replace(/\n$/, "");
                      const match = /language-(\w+)/.exec(className || "");

                      if (!match) {
                        return (
                          <code
                            className="px-1 py-0.5 rounded-sm font-mono text-sm"
                            {...props}
                          >
                            {content}
                          </code>
                        );
                      }

                      return (
                        <CodeBlock
                          key={Math.random()}
                          language={(match && match[1]) || ""}
                          value={content}
                          {...props}
                        />
                      );
                    },
                  }}
                >
                  {`\`\`\`json\n${JSON.stringify(lastLog, null, 2)}\n\`\`\``}
                </MemoizedReactMarkdown>
              </div>
            </div>
          )}

          {intelligence && (
            <div className="p-4 border rounded-lg space-y-2">
              <h4 className="font-mono text-sm">analysis:</h4>
              <div className="bg-muted p-2 rounded overflow-auto">
                <MemoizedReactMarkdown
                  className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0"
                  remarkPlugins={[remarkGfm, remarkMath]}
                  components={{
                    video({ node, className, children, ...props }) {
                      const content = String(children).replace(/\n$/, "");
                      const match = /language-(\w+)/.exec(className || "");

                      const isMP4File = hasMP4File(content);

                      if (isMP4File || !match) {
                        return <VideoComponent filePath={content.trim()} />;
                      }

                      return (
                        <CodeBlock
                          key={Math.random()}
                          language={(match && match[1]) || ""}
                          value={content}
                          {...props}
                        />
                      );
                    },
                    p({ children }) {
                      return <p className="mb-2 last:mb-0">{children}</p>;
                    },
                    a({ node, href, children, ...props }) {
                      const isMP4Link = href?.toLowerCase().includes(".mp4");

                      if (isMP4Link && href) {
                        return <VideoComponent filePath={href} />;
                      }
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                    code({ node, className, children, ...props }) {
                      const content = String(children).replace(/\n$/, "");
                      const match = /language-(\w+)/.exec(className || "");

                      const isMP4File = hasMP4File(content);

                      if (isMP4File || !match) {
                        if (isMP4File) {
                          return <VideoComponent filePath={content.trim()} />;
                        }
                        return (
                          <code
                            className="px-1 py-0.5 rounded-sm font-mono text-sm"
                            {...props}
                          >
                            {content}
                          </code>
                        );
                      }

                      return (
                        <CodeBlock
                          key={Math.random()}
                          language={(match && match[1]) || ""}
                          value={content}
                          {...props}
                        />
                      );
                    },
                  }}
                >
                  {`${intelligence}`}
                </MemoizedReactMarkdown>
              </div>
            </div>
          )}

          <div className="h-10" />
        </div>
      </form>
    </div>
  );
}
