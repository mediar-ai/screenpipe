"use client";

import { useState } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, FileCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export function ObsidianSettings() {
  const { settings, updateSettings } = useSettings();
  const [lastLog, setLastLog] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async (e: React.FormEvent) => {
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
    } catch (err) {
      console.error("error testing log:", err);
    } finally {
      setLoading(false);
    }
  };

  const openPath = async () => {
    try {
      // Open directory picker dialog
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
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
    } catch (err) {
      console.error("failed to open directory picker:", err);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
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
            defaultValue={settings.customSettings?.obsidian?.pageSize || 100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="aiModel">ai model</Label>
          <Input
            id="aiModel"
            name="aiModel"
            defaultValue={
              settings.customSettings?.obsidian?.aiModel ||
              "llama3.2:3b-instruct-q4_K_M"
            }
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
      </div>
    </div>
  );
}
