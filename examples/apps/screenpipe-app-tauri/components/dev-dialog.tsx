import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/lib/hooks/use-settings";
import { useToast } from "@/components/ui/use-toast";

export function DevSettings() {
  const { settings, updateSettings } = useSettings();
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (key: keyof typeof settings, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    toast({
      title: "updating dev settings",
      description: "this may take a few moments...",
    });

    try {
      await updateSettings(localSettings);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: "dev settings updated successfully",
        description: "your changes have been saved.",
      });
    } catch (error) {
      console.error("failed to update dev settings:", error);
      toast({
        title: "error updating dev settings",
        description: "please try again or check the logs for more information.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">dev settings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[80vw] w-full max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>dev settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {Object.entries(localSettings).map(([key, value]) => (
            <div key={key} className="flex flex-col space-y-2">
              <Label htmlFor={key}>{key}</Label>
              {typeof value === "boolean" ? (
                <Switch
                  id={key}
                  checked={value}
                  onCheckedChange={(checked) =>
                    handleChange(key as any, checked)
                  }
                />
              ) : typeof value === "string" ? (
                key === "customPrompt" ? (
                  <Textarea
                    id={key}
                    value={value}
                    onChange={(e) => handleChange(key as any, e.target.value)}
                    rows={4}
                  />
                ) : (
                  <Input
                    id={key}
                    value={value}
                    onChange={(e) => handleChange(key as any, e.target.value)}
                  />
                )
              ) : typeof value === "number" ? (
                <Input
                  id={key}
                  type="number"
                  value={value}
                  onChange={(e) =>
                    handleChange(key as any, Number(e.target.value))
                  }
                />
              ) : Array.isArray(value) ? (
                <Textarea
                  id={key}
                  value={JSON.stringify(value)}
                  onChange={(e) =>
                    handleChange(key as any, JSON.parse(e.target.value))
                  }
                  rows={4}
                />
              ) : (
                <Input
                  id={key}
                  value={JSON.stringify(value)}
                  onChange={(e) =>
                    handleChange(key as any, JSON.parse(e.target.value))
                  }
                />
              )}
            </div>
          ))}
        </div>
        <Button onClick={handleSave} className="mt-4" disabled={isSaving}>
          {isSaving ? "saving..." : "save changes"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
