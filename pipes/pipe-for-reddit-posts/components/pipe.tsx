"use client";
import { useSettings } from "@/lib/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileCheck } from "lucide-react";
import { useToast } from "@/lib/use-toast";
import updatePipeConfig from "@/lib/actions/update-pipe-config";

const Pipe: React.FC = () => {

  const { settings, updateSettings } = useSettings();
  const { toast } = useToast();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const newSettings = {
      interval: parseInt(formData.get("interval") as string),
      pageSize: parseInt(formData.get("pageSize") as string),
      summaryFrequency: formData.get("summaryFrequency") as string,
      emailAddress: formData.get("emailAddress") as string,
      emailPassword: formData.get("emailPassword") as string,
      emailTime: (formData).get("emailTime") as string,
      customPrompt: formData.get("customPrompt") as string,
      dailylogPrompt: formData.get("dailylogPrompt") as string,
      contentType: formData.get("contentType") as string,
      windowName: formData.get("windowName") as string
    }
    const aiUrl = settings.aiUrl;
    const aiModel = settings.aiModel;
    const openaiApiKey = settings.openaiApiKey;

    try {
      await updateSettings(newSettings, "reddit");
      await updatePipeConfig(newSettings, aiUrl, aiModel, openaiApiKey);
      toast({
        title: "settings saved",
        description: "your reddit pipe settings have been updated",
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
    <div className="w-full max-w-2xl mx-auto space-y-8 mt-2">
      <form onSubmit={handleSave} className="space-y-4 w-full">
        <div className="space-y-2">
          <Label htmlFor="path">time interval</Label>
          <div className="flex gap-2">
            <Input
              id="interval"
              name="interval"
              type="number"
              defaultValue={settings.customSettings?.reddit?.interval || 60}
              placeholder="value in seconds"
              className="flex-1"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pageSize">page size</Label>
          <Input
            id="pageSize"
            name="pageSize"
            type="number"
            defaultValue={settings.customSettings?.reddit?.pageSize || 100}
            placeholder="size of page"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="summaryFrequency">summary Frequency</Label>
          <Input
            id="summaryFrequency"
            name="summaryFrequency"
            defaultValue={settings.customSettings?.reddit?.summaryFrequency || "daily"}
            placeholder="frequency of summary emails: 'daily' for once a day at emailTime, or 'hourly:X' for every X hours (e.g., 'hourly:4' for every 4 hours)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailTime">email time</Label>
          <Input
            id="emailTime"
            name="emailTime"
            type="time"
            defaultValue={settings.customSettings?.reddit?.emailTime || "11:00"}
            placeholder="time to send daily summary email (used only if summaryFrequency is 'daily')"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailAddress">email address</Label>
          <Input
            id="emailAddress"
            name="emailAddress"
            type="email"
            defaultValue={settings.customSettings?.reddit?.emailAddress || ""}
            placeholder="email address to send the daily summary to"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailPassword">email app specific password</Label>
          <Input
            id="emailPassword"
            name="emailPassword"
            type="password"
            defaultValue={settings.customSettings?.reddit?.emailPassword || ""}
            placeholder="app specific password for your gmail account"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contentType">content type</Label>
          <Input
            id="contentType"
            name="contentType"
            className="w-full text-sm min-h-[20px] p-2 rounded-md border bg-background"
            placeholder="Type of content to analyze: 'ocr', 'audio', or 'all'. OCR usually contains more content, so it's recommended to choose either OCR or audio rather than 'all' for better performance."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="windowName">window name</Label>
          <Input
            id="windowName"
            name="windowName"
            className="w-full text-sm min-h-[20px] p-2 rounded-md border bg-background"
            placeholder="Specific window name to filter the screen data, for example 'gmail', 'john', 'slack', 'myCodeFile.tsx', etc. this will filter out audio"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dailylogPrompt">daily prompt</Label>
          <textarea
            id="dailylogPrompt"
            name="dailylogPrompt"
            className="w-full text-sm min-h-[20px] p-2 rounded-md border bg-background"
            defaultValue={ settings.customSettings?.reddit?.dailylogPrompt || "" }
            placeholder="additional prompt for the AI assistant that will be used to extract information from the screen data every specified amount of minutes"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customPrompt">custom prompt</Label>
          <textarea
            id="customPrompt"
            name="customPrompt"
            className="w-full text-sm min-h-[20px] p-2 rounded-md border bg-background"
            defaultValue={ settings.customSettings?.reddit?.customPrompt || "" }
            placeholder="additional prompt for the AI assistant that will be used to generate a list of questions to post on reddit based on the logs previously extracted"
          />
        </div>
        <Button type="submit" >
          <FileCheck className="mr-2 h-4 w-4" />
          save settings
        </Button>
      </form>
    </div>
  );
}

export default Pipe;
