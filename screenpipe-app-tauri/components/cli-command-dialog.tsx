import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { CodeBlock } from "./ui/codeblock";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useToast } from "@/components/ui/use-toast";
import { IconCode } from "./ui/icons";
import { Settings } from "@/lib/hooks/use-settings";
import { getCliPath } from "@/lib/utils";

interface CliCommandDialogProps {
  settings: Settings;
}

export function CliCommandDialog({ settings }: CliCommandDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const { toast } = useToast();

  const generateCliCommand = () => {
    const cliPath = getCliPath();
    let args = [];

    if (settings.audioTranscriptionEngine !== "default") {
      // TBD hard coded for now 
      // if someone wants to use deepgram / screenpipe cloud in CLI mode they'll ask us
      args.push(`--audio-transcription-engine whisper-large-v3-turbo`);
    }
    if (settings.ocrEngine !== "default") {
      args.push(`--ocr-engine ${settings.ocrEngine}`);
    }
    if (
      settings.monitorIds.length > 0 &&
      settings.monitorIds[0] !== "default"
    ) {
      settings.monitorIds.forEach((id) => args.push(`--monitor-id ${id}`));
    }
    if (settings.languages.length > 0) {
      settings.languages.forEach((id) => args.push(`--language ${id}`));
    }
    if (
      settings.audioDevices.length > 0 &&
      settings.audioDevices[0] !== "default"
    ) {
      settings.audioDevices.forEach((device) =>
        args.push(`--audio-device "${device}"`)
      );
    }
    if (settings.usePiiRemoval) {
      args.push("--use-pii-removal");
    }
    if (settings.restartInterval > 0) {
      args.push(`--restart-interval ${settings.restartInterval}`);
    }
    if (settings.disableAudio) {
      args.push("--disable-audio");
    }
    settings.ignoredWindows.forEach((window) =>
      args.push(`--ignored-windows "${window}"`)
    );
    settings.includedWindows.forEach((window) =>
      args.push(`--included-windows "${window}"`)
    );
    if (settings.deepgramApiKey && settings.deepgramApiKey !== "default") {
      args.push(`--deepgram-api-key "${settings.deepgramApiKey}"`);
    }
    if (settings.fps !== 0.2) {
      args.push(`--fps ${settings.fps}`);
    }
    if (settings.vadSensitivity !== "high") {
      args.push(`--vad-sensitivity ${settings.vadSensitivity}`);
    }

    if (!settings.analyticsEnabled) {
      args.push("--disable-telemetry");
    }
    if (settings.audioChunkDuration !== 30) {
      args.push(`--audio-chunk-duration ${settings.audioChunkDuration}`);
    }

    if (settings.languages.length > 0) {
      settings.languages.forEach((id) => args.push(`--language ${id}`));
    }

    if (settings.enableFrameCache) {
      args.push("--enable-frame-cache");
    }

    if (settings.enableUiMonitoring) {
      args.push("--enable-ui-monitoring");
    }

    if (settings.enableRealtimeAudioTranscription) {
      args.push("--enable-realtime-audio-transcription");
    }

    const envString = envVars.length > 0 ? `${envVars.join(" ")} ` : "";
    return `${envString}${cliPath} ${args.join(" ")}`;
  };

  const handleCopyCliCommand = () => {
    const command = generateCliCommand();
    copyToClipboard(command);
    toast({
      title: "CLI command copied",
      description: "The CLI command has been copied to your clipboard.",
    });
  };

  return (
    <>
      <Button variant="outline" size="icon" onClick={() => setIsOpen(true)}>
        <IconCode className="h-4 w-4" />
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CLI command</DialogTitle>
            <DialogDescription>
              you can use this CLI command to start screenpipe with the current
              settings.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <CodeBlock language="bash" value={generateCliCommand()} />
          </div>
          <DialogFooter>
            <Button onClick={handleCopyCliCommand}>Copy to Clipboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
