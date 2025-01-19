"use client";
import React, { useState } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileCheck, Laptop } from "lucide-react";
import { useToast } from "@/lib/use-toast";
import updatePipeConfig from "@/lib/actions/update-pipe-config";
import { useHealthCheck } from "@/lib/hooks/use-health";
import { MemoizedReactMarkdown } from "./markdown";
import { SqlAutocompleteInput } from "./sql-autocomplete-input";
import { Eye, EyeOff } from "lucide-react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const Pipe: React.FC = () => {

  const { settings, updateSettings } = useSettings();
  const { isServerDown } = useHealthCheck();
  const { toast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState<boolean>();
  const [lastLog, setLastLog] = useState<any>(null);
  const [windowName, setWindowName] = useState("");
  const [contentType, setContentType] = useState("");

  const aiDisabled = settings.aiProviderType === "screenpipe-cloud" && !settings.user.token;

  const defaultDailylogPrompt = 
`- Analyze user activities and summarize them into a structured daily log.
- Focus on identifying the purpose and context of each activity, categorizing them into clear categories like 'work', 'email', 'slack', etc.
- Assign appropriate tags that provide context and detail about the activity.
- Ensure the summary is concise, relevant, and uses simple language.
`;
  
  const defaultCustomPrompt = 
`- Craft engaging and community-friendly posts based on given screen data. 
- Focus on generating specific and thoughtful questions that encourage discussion or helpful responses from the Reddit community. 
- Use casual and approachable language, keeping the posts concise and easy to read. 
- Include context when it adds value to the question but avoid overly personal details.
- Ensure posts are well-structured, starting with a clear title, followed by a detailed body, and end with relevant subreddit recommendations.
`;

  const testPipe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/test-pipeline");
      if (res.status === 500 || res.status === 400) {
        toast({
          title: "failed to intialize daily log",
          description: "please check your credentials",
          variant: "destructive"
        }) 
      } else if (res.status === 200) {
        toast({
          title: "pipe initalized sucessfully",
          variant: "default"
        }) 
      }
      const data = await res.json();
      if (data.suggestedQuestions) {
        setLastLog(data.suggestedQuestions);
      } else {
        setLastLog(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error("error testing log:", err);
    } finally {
      setLoading(false);
    }
  };

  const isMacOS = () => {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const newRedditSettings = {
      interval: parseInt(formData.get("interval") as string),
      pageSize: parseInt(formData.get("pageSize") as string),
      summaryFrequency: formData.get("summaryFrequency") as string,
      emailAddress: formData.get("emailAddress") as string,
      emailPassword: formData.get("emailPassword") as string,
      emailTime: (formData).get("emailTime") as string,
      customPrompt: formData.get("customPrompt") as string,
      dailylogPrompt: formData.get("dailylogPrompt") as string,
      windowName: formData.get("windowName") as string || windowName,
      contentType: contentType as string,
      lastIntervalChangeTime: new Date().toISOString()
    }

    try {
      await updateSettings(newRedditSettings, "reddit-auto-posts");
      await updatePipeConfig(newRedditSettings);
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
          <Label htmlFor="path">time interval </Label>
          <span className="text-[13px] text-muted-foreground">&nbsp;&nbsp;we will extract information chunks at this interval to create posts</span>
          <div className="flex gap-2">
            <Input
              id="interval"
              name="interval"
              type="number"
              defaultValue={settings.customSettings?.["reddit-auto-posts"]?.interval || 60}
              placeholder="value in seconds"
              className="flex-1"
            />
          </div>
        </div>
        <div className="space-y-3">
          <Label htmlFor="pageSize">page size </Label>
          <span className="text-[13px] text-muted-foreground">&nbsp;&nbsp;number of records to retrieve per page for extraction, considering LLM context limits</span>
          <Input
            id="pageSize"
            name="pageSize"
            type="number"
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.pageSize || 100}
            placeholder="size of page"
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="summaryFrequency">summary frequency </Label>
          <span className="text-[13px] text-muted-foreground">&nbsp;&nbsp;email frequency: &apos;daily&apos; at email time or &apos;hourly:X&apos;(e.g.
            &apos;hourly:4&apos; for every 4 hrs).</span>
          <Input
            id="summaryFrequency"
            name="summaryFrequency"
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.summaryFrequency || "daily"}
            placeholder="frequency of summary emails: 'daily' for once a day at email time, or 'hourly:X' for every X hours (e.g., 'hourly:4' for every 4 hours)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailTime">email time </Label>
          <span className="text-[13px] text-muted-foreground">&nbsp;&nbsp;time to send daily summary email (used only if summary frequency is &apos;daily&apos;)</span>
          <Input
            id="emailTime"
            name="emailTime"
            type="time"
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.emailTime || "11:00"}
            placeholder="time to send daily summary email (used only if summaryFrequency is 'daily')"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailAddress">email address </Label>
          <span className="text-[13px] text-muted-foreground">&nbsp;&nbsp;email address to send the daily summary to: (eg. me@mail.com)</span>
          <Input
            id="emailAddress"
            name="emailAddress"
            type="email"
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.emailAddress || ""}
            placeholder="email address"
          />
        </div>
        <div className="space-y-3 relative items-center">
          <Label htmlFor="emailPassword">email app specific password </Label>
          <span className="text-[13px] text-muted-foreground">&nbsp;&nbsp;app specific password for your gmail account, you can find it
            <a href="https://support.google.com/accounts/answer/185833?hl=en" target="_blank" className="hover:underline text-sky-700"> here</a></span>
          <Input
            id="emailPassword"
            name="emailPassword"
            type={showKey ? "text" : "password"}
            autoCorrect="off"
            autoComplete="off"
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.emailPassword || ""}
            placeholder="password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-[25px]"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
                <Eye className="h-4 w-4" />
              )}
          </Button>
        </div>
        <div className="space-y-3">
          <Label htmlFor="contentType">
            <span>content type </span>
            <span className="text-[13px] text-muted-foreground !font-normal">&nbsp;&nbsp;type of content to analyze &apos;ocr&apos;, &apos;audio&apos;, or &apos;all&apos;. &apos;ocr&apos; is recommended due to more content</span>
          </Label>
          <Select
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.contentType || "all"}
            onValueChange={(value) => {
                setContentType(value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="select content type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="ocr">ocr</SelectItem>
              <SelectItem value="audio">audio</SelectItem>
              {isMacOS() && <SelectItem value="ui">ui</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          <Label htmlFor="windowName">window name</Label>
          <span className="text-[13px] text-muted-foreground">&nbsp;&nbsp;specific window name to filter the screen data, for example &apos;gmail&apos;,
            &apos;john&apos;, &apos;slack&apos; etc.</span>
          <SqlAutocompleteInput
            id="windowName"
            name="windowName"
            type="window"
            icon={<Laptop className="h-4 w-4" />}
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.windowName}
            onChange={(v) => setWindowName(v)}
            placeholder="window name to filter the screen data"
            className="flex-grow"
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="dailylogPrompt">daily prompt</Label>
          <textarea
            id="dailylogPrompt"
            name="dailylogPrompt"
            className="w-full text-sm min-h-[30px] p-2 rounded-md border bg-background"
            defaultValue={ settings.customSettings?.["reddit-auto-posts"]?.dailylogPrompt || `${defaultDailylogPrompt}` }
            placeholder="additional prompt for the AI assistant that will be used to extract information from the screen data every specified amount of minutes"
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="customPrompt">custom prompt</Label>
          <textarea
            id="customPrompt"
            name="customPrompt"
            className="w-full text-sm min-h-[30px] p-2 rounded-md border bg-background"
            defaultValue={settings.customSettings?.["reddit-auto-posts"]?.customPrompt || `${defaultCustomPrompt}` }
            placeholder="additional prompt for the AI assistant that will be used to generate a list of questions to post on reddit based on the logs previously extracted"
          />
        </div>
        <Button type="submit" >
          <FileCheck className="mr-2 h-4 w-4" />
          save settings
        </Button>
      </form>
      <div className="space-y-4 pb-[30px] w-full flex flex-col">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={testPipe}
                  className="w-full border-[1.4px] shadow-sm"
                  variant={"outline"}
                  disabled={loading || aiDisabled || isServerDown}
                >
                {loading ? "generating..." : "generate reddit questions"}
                </Button>
              </span>
            </TooltipTrigger>
            {(aiDisabled || isServerDown) && (
              <TooltipContent>
                <p>{`${(aiDisabled && isServerDown) ? 
                  "you don't have access of screenpipe-cloud and screenpipe is down!" 
                  : isServerDown ? "screenpipe is not running..."
                  : aiDisabled ? "you don't have access to screenpipe-cloud :( please consider login"
                  : ""
                  }
                `}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        {lastLog && (
        <div className="p-4 border rounded-lg space-y-2 font-mono text-sm">
          <MemoizedReactMarkdown
            className="prose break-words dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 w-[35vw] text-sm"
            remarkPlugins={[remarkGfm, remarkMath]}
            components={{
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              a: ({ href, children, ...props }) => {
                const isExternal =
                  href?.startsWith("http") || href?.startsWith("https");
                return (
                  <a
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    className="break-all text-blue-500 hover:underline"
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {lastLog}
          </MemoizedReactMarkdown>
        </div>
        )}
      </div>
    </div>
  );
}

export default Pipe;
