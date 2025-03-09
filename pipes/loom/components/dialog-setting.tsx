"use client";
import React, { useState, useEffect } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileCheck, Laptop } from "lucide-react";
import { useToast } from "@/lib/use-toast";
import { SqlAutocompleteInput } from "./sql-autocomplete-input";
import { Settings } from "@screenpipe/browser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

const DialogSettings: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const { settings, updateSettings } = useSettings();
  const [windowName, setWindowName] = useState("");
  const [contentType, setContentType] = useState("");

const defaultCustomRules = `- Create a concise  summary of the given context 
- Don't ask any type of questions
- Don't include any type of absolute path in answer
- Ensure the summary is precise and captures the essence of the content.
- Start with an engaging opening sentence.
- Follow with a detailed description of the main topics.
- Conclude with a call-to-action or additional information.
- Ensure the description is written in a natural and readable manner.
- Avoid technical jargon unless necessary.
- Keep the tone and style consistent throughout the description.
- Use proper grammar and punctuation.
- Add relevant tags or keywords to improve searchability.
- Ensure tags are related to the main topics identified.
`;

  useEffect(() => {
    if (!contentType) {
      const timer = setTimeout(() => {
        setContentType(
          settings.customSettings?.loom?.contentType || "ocr"
        );
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [settings, contentType]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const loomSettings = {
      customRules: formData.get("customRules") as string,
      maxLength: formData.get("maxLength") as string,
      windowName: (formData.get("windowName") as string) || windowName,
      contentType: contentType as string,
    };

    try {
      await updateSettings(loomSettings, "loom");
      toast({
        title: "settings saved",
        description: "your loom pipe settings have been updated",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "error",
        description: "failed to save settings",
      });
    }
  };

  return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
      >
      <DialogContent className="sm:max-w-[900px] h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-semibold text-2xl">settings</DialogTitle>
          <DialogDescription>
            adjust additional loom pipe settings
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 w-full">
          <div className="space-y-2">
            <Label htmlFor="contentType">
              <span>content type </span>
              <span className="text-[13px] text-muted-foreground !font-normal">
                &nbsp;&nbsp;type of content to analyze &apos;ocr&apos;,
                &apos;audio&apos;, or &apos;all&apos;. &apos;ocr&apos; is
                recommended due to more content
              </span>
            </Label>
            <Select
              value={contentType}
              onValueChange={(value) => {
                setContentType(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="select content type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem textValue="ocr" value="ocr">
                  ocr
                </SelectItem>
                <SelectItem textValue="audio" value="audio">
                  audio
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxLength">max content length</Label>
            <span className="text-[13px] text-muted-foreground">
              &nbsp;&nbsp; max content length of characters getting from screenpipe api
            </span>
            <div className="flex gap-2">
              <Input
                id="maxLength"
                name="maxLength"
                type="number"
                defaultValue={
                  settings.customSettings?.loom?.maxLength || 100
                }
                placeholder="max value for contents"
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="windowName">window name</Label>
            <span className="text-[13px] text-muted-foreground">
              &nbsp;&nbsp;specific window name to include in loom video, for
              example &apos;tmux&apos;, &apos;firefox&apos;, &apos;slack&apos; etc.
            </span>
            <SqlAutocompleteInput
              id="windowName"
              name="windowName"
              type="window"
              icon={<Laptop className="h-4 w-4" />}
              defaultValue={
                settings.customSettings?.loom?.windowName
              }
              onChange={(v) => setWindowName(v)}
              placeholder="window name to filter the screen data"
              className="flex-grow"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customRules">custom rules</Label>
            <textarea
              id="customRules"
              name="customRules"
              className="w-full text-sm !h-[100px] p-2 rounded-md border bg-background"
              defaultValue={
                settings.customSettings?.loom?.customRules || `${defaultCustomRules}`
              }
              placeholder="additional rules to define for AI assistant"
            />
          </div>
          <Button type="submit">
            <FileCheck className="mr-2 h-4 w-4" />
            save settings
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export default DialogSettings;
