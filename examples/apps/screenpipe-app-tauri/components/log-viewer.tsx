import { useState, useEffect } from "react";
import { readTextFile, BaseDirectory, watch } from "@tauri-apps/plugin-fs";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { join, resolveResource } from "@tauri-apps/api/path";

export function LogViewer() {
  const [logs, setLogs] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const loadLogs = async () => {
        try {
          const logPath = await resolveResource(".screenpipe/screenpipe.log");
          const content = await readTextFile(logPath);
          setLogs(content);
        } catch (error) {
          console.error("Error reading log file:", error);
          setLogs("Error reading log file");
        }
      };

      loadLogs();

      const setupWatcher = async () => {
        const logPath = await resolveResource(".screenpipe/screenpipe.log");
        const stopWatching = await watch(logPath, async () => {
          await loadLogs();
        });

        return stopWatching;
      };

      let unwatch: (() => void) | undefined;
      setupWatcher().then((stopWatching) => {
        unwatch = stopWatching;
      });

      return () => {
        if (unwatch) unwatch();
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
