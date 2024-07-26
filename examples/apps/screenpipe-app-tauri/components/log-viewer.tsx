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

      /*
      [Error] Error reading log file: – "failed to read file as text at path: /Applications/screenpipe.app/Contents/Resources/.screenpipe/screenpipe.log with error: No such file o…"
      "failed to read file as text at path: /Applications/screenpipe.app/Contents/Resources/.screenpipe/screenpipe.log with error: No such file or directory (os error 2)"
        (anonymous function) (733-ce7d083d9f39eae2.js:1:3977)
        (anonymous function) (page-c4b19e5f4f41f600.js:1:31308)
      [Error] Failed to load resource: the server responded with a status of 400 (Bad Request) (plugin:fs|watch, line 0)
      [Error] Unhandled Promise Rejection: Command watch not found
      [Error] Failed to load resource: the server responded with a status of 400 (Bad Request) (plugin:fs|read_text_file, line 0)
      [Error] Error reading log file: – "failed to read file as text at path: /Applications/screenpipe.app/Contents/Resources/.screenpipe/screenpipe.log with error: No such file o…"
      "failed to read file as text at path: /Applications/screenpipe.app/Contents/Resources/.screenpipe/screenpipe.log with error: No such file or directory (os error 2)"
        (anonymous function) (733-ce7d083d9f39eae2.js:1:3977)
        (anonymous function) (page-54e78c62d5f111c4.js:1:31314) 
       */
      // const setupWatcher = async () => {
      //   const logPath = await resolveResource(".screenpipe/screenpipe.log");
      //   const stopWatching = await watch(logPath, async () => {
      //     await loadLogs();
      //   });

      //   return stopWatching;
      // };

      // let unwatch: (() => void) | undefined;
      // setupWatcher().then((stopWatching) => {
      //   unwatch = stopWatching;
      // });

      // return () => {
      //   if (unwatch) unwatch();
      // };
      // Polling every x ms (customizable)
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
