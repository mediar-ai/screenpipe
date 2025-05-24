import React, { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import Convert from "ansi-to-html";
import localforage from "localforage";
import { Button } from "./ui/button"; // import Button component

interface LogViewerProps {
  className?: string;
}

const convert = new Convert({ newline: true });

const LogViewer: React.FC<LogViewerProps> = ({ className }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initLogs = async () => {
      // load logs from localforage
      const storedLogs = await localforage.getItem<string[]>("sidecar_logs");
      if (storedLogs) {
        setLogs(storedLogs);
      }
    };

    initLogs();

    const unlisten = listen<string>("sidecar_log", (event) => {
      setLogs((prevLogs) => {
        const newLogs = [...prevLogs, event.payload].slice(-100);
        localforage.setItem("sidecar_logs", newLogs);
        return newLogs;
      });
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // function to clear logs
  const clearLogs = async () => {
    await localforage.removeItem("sidecar_logs");
    setLogs([]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const htmlLogs = logs.map((log) => convert.toHtml(log));

  return (
    <div className="flex flex-col py-2">
      <Button
        onClick={clearLogs}
        className="mb-2 self-end"
        variant="outline"
        size="sm"
      >
        clear logs
      </Button>
      <div
        ref={logContainerRef}
        className={cn(
          "h-64 overflow-y-auto bg-black p-2 font-mono text-sm text-white",
          "whitespace-pre-wrap break-words",
          className
        )}
      >
        {htmlLogs.map((log, index) => (
          <div
            key={index}
            dangerouslySetInnerHTML={{ __html: log }}
            className="leading-5"
          />
        ))}
      </div>
    </div>
  );
};

export default LogViewer;
