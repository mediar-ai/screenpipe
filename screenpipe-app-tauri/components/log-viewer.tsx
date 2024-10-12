import { useState, useEffect } from "react";
import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { platform } from "@tauri-apps/plugin-os";
import { homeDir, resolveResource } from "@tauri-apps/api/path";

export function LogViewer() {
  const [logs, setLogs] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const loadLogs = async () => {
        try {
          const os = platform();
          const homeDirPath = await homeDir();
          const today = new Date().toISOString().split("T")[0];
          const logFileName = `screenpipe.${today}.log`;

          const logPath =
            os === "windows"
              ? await resolveResource(
                  `${homeDirPath}\\.screenpipe\\${logFileName}`
                )
              : await resolveResource(
                  `${homeDirPath}/.screenpipe/${logFileName}`
                );

          const content = await readTextFile(logPath);
          setLogs(content);
        } catch (error) {
          console.error("error reading log file:", error);
          setLogs("error reading log file");
        }
      };

      loadLogs();

      const pollingInterval = 500; // Customize this value
      const intervalId = setInterval(() => {
        loadLogs();
      }, pollingInterval);

      return () => {
        clearInterval(intervalId); // Clear the interval on cleanup
      };
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">View Logs</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Application Logs</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto whitespace-pre-wrap">{logs}</div>
      </DialogContent>
    </Dialog>
  );
}
