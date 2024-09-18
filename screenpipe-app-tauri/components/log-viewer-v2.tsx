import React, { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import Convert from 'ansi-to-html';

interface LogViewerProps {
  className?: string;
}

const convert = new Convert({newline: true});

const LogViewer: React.FC<LogViewerProps> = ({ className }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<string>("sidecar_log", (event) => {
      setLogs((prevLogs) => [...prevLogs, event.payload].slice(-100)); // Keep last 100 logs
    });

    return () => {
      unlisten.then((f) => f()); // Cleanup listener when component unmounts
    };
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const htmlLogs = logs.map((log) => convert.toHtml(log));

  return (
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
  );
};

export default LogViewer;
