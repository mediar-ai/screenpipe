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
  localSettings: Settings;
}

export function CliCommandDialog({ localSettings }: CliCommandDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const { toast } = useToast();

  const generateCliCommand = () => {
    const cliPath = getCliPath();
    let args = [];

    if (localSettings.audioTranscriptionEngine !== "default") {
      args.push(
        `--audio-transcription-engine ${localSettings.audioTranscriptionEngine}`
      );
    }
    if (localSettings.ocrEngine !== "default") {
      args.push(`--ocr-engine ${localSettings.ocrEngine}`);
    }
    if (
      localSettings.monitorIds.length > 0 &&
      localSettings.monitorIds[0] !== "default"
    ) {
      localSettings.monitorIds.forEach((id) => args.push(`--monitor-id ${id}`));
    }
    if (localSettings.languages.length > 0) {
      localSettings.languages.forEach((id) => args.push(`--language ${id}`));
    }
    if (
      localSettings.audioDevices.length > 0 &&
      localSettings.audioDevices[0] !== "default"
    ) {
      localSettings.audioDevices.forEach((device) =>
        args.push(`--audio-device "${device}"`)
      );
    }
    if (localSettings.usePiiRemoval) {
      args.push("--use-pii-removal");
    }
    if (localSettings.restartInterval > 0) {
      args.push(`--restart-interval ${localSettings.restartInterval}`);
    }
    if (localSettings.disableAudio) {
      args.push("--disable-audio");
    }
    localSettings.ignoredWindows.forEach((window) =>
      args.push(`--ignored-windows "${window}"`)
    );
    localSettings.includedWindows.forEach((window) =>
      args.push(`--included-windows "${window}"`)
    );
    if (
      localSettings.deepgramApiKey &&
      localSettings.deepgramApiKey !== "default"
    ) {
      args.push(`--deepgram-api-key "${localSettings.deepgramApiKey}"`);
    }
    if (localSettings.fps !== 0.2) {
      args.push(`--fps ${localSettings.fps}`);
    }
    if (localSettings.vadSensitivity !== "high") {
      args.push(`--vad-sensitivity ${localSettings.vadSensitivity}`);
    }

    if (!localSettings.analyticsEnabled) {
      args.push("--disable-telemetry");
    }
    if (localSettings.audioChunkDuration !== 30) {
      args.push(`--audio-chunk-duration ${localSettings.audioChunkDuration}`);
    }

    if (localSettings.languages.length > 0) {
      localSettings.languages.forEach((id) => args.push(`--language ${id}`));
    }

    if (localSettings.enableFrameCache) {
      args.push("--enable-frame-cache");
    }

    if (localSettings.enableUiMonitoring) {
      args.push("--enable-ui-monitoring");
    }

    return `${cliPath} ${args.join(" ")}`;
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
