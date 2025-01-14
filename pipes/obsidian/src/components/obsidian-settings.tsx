"use client";

import { useState } from "react";
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
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { OllamaModelsList } from "./ollama-models-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import path from "path";
import { pipe } from "@screenpipe/browser";

export function ObsidianSettings() {
  const { settings, updateSettings } = useSettings();
  const [lastLog, setLastLog] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [intelligence, setIntelligence] = useState<any>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [logDeepLink, setLogDeepLink] = useState<string | null>(null);
  const [intelligenceDeepLink, setIntelligenceDeepLink] = useState<
    string | null
  >(null);

  const handleSave = async (e: React.FormEvent) => {
    pipe.captureMainFeatureEvent("obsidian", {
      action: "save-settings",
    });
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    try {
      await updateSettings(
        {
          // @ts-ignore
          path: formData.get("path") as string,
          interval: parseInt(formData.get("interval") as string) * 60000,
          pageSize: parseInt(formData.get("pageSize") as string),
          aiModel: formData.get("aiModel") as string,
          prompt: formData.get("prompt") as string,
        },
        "obsidian"
      );

      toast({
        title: "settings saved",
        description: "your obsidian settings have been updated",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to save settings",
      });
    }
  };

  const testLog = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/log");
      const data = await res.json();
      setLastLog(data);
      setLogDeepLink(data.deepLink);
    } catch (err) {
      console.error("error testing log:", err);
    } finally {
      setLoading(false);
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
            "your browser doesn't support directory selection. please enter the path manually.",
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
          ...settings.customSettings?.obsidian,
          path,
        },
        "obsidian"
      );

      toast({
        title: "path updated",
        description: "obsidian vault path has been set",
      });
    } catch (err) {
      console.error("failed to open directory picker:", err);
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
      console.error("error testing intelligence:", err);
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <Tabs defaultValue="logs">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="logs">logs</TabsTrigger>
          <TabsTrigger value="intelligence">intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          <form onSubmit={handleSave} className="space-y-4 w-full">
            <div className="space-y-2">
              <Label htmlFor="path">obsidian vault path</Label>
              <div className="flex gap-2">
                <Input
                  id="path"
                  name="path"
                  defaultValue={settings.customSettings?.obsidian?.path}
                  placeholder="/path/to/vault"
                  className="flex-1"
                />
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
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
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
              <textarea
                id="prompt"
                name="prompt"
                className="w-full min-h-[100px] p-2 rounded-md border bg-background"
                defaultValue={
                  settings.customSettings?.obsidian?.prompt ||
                  `yo, you're my personal data detective! 🕵️‍♂️

rules for the investigation:
- extract names of people i interact with and what we discussed
- identify recurring topics/themes in my convos
- spot any promises or commitments made (by me or others)
- catch interesting ideas or insights dropped in casual chat
- note emotional vibes and energy levels in conversations
- highlight potential opportunities or connections
- track project progress and blockers mentioned

style rules:
- keep it real and conversational
- use bullet points for clarity
- include relevant timestamps
- group related info together
- max 4 lines per insight
- no corporate speak, keep it human
- for tags use hyphen between words, no spaces, eg: #my-tag not #my tag nor #myTag nor #my_tag

remember: you're analyzing screen ocr text & audio, etc. from my computer, so focus on actual interactions and content!`
                }
              />
            </div>

            <Button type="submit">
              <FileCheck className="mr-2 h-4 w-4" />
              save settings
            </Button>
          </form>

          <div className="space-y-4 w-full flex flex-col">
            <Button
              onClick={testLog}
              variant="outline"
              disabled={loading}
              className="w-full"
            >
              {loading ? "testing..." : "test log generation"}
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
                className="ml-2"
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
              disabled={intelligenceLoading}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
