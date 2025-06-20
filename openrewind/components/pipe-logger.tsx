import React, { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { CodeBlock } from "@/components/ui/codeblock";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface LogEntry {
  pipe_id: string;
  level: string;
  message: string;
  timestamp: string;
}

interface PipeLoggerProps {
  pipeId: string;
}

const PipeLogger: React.FC<PipeLoggerProps> = ({ pipeId }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<LogEntry>("log-message", (event) => {
      if (event.payload.pipe_id === pipeId) {
        setLogs((prevLogs) => [
          ...prevLogs,
          `[${event.payload.level}] ${event.payload.message}`,
        ]);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [pipeId]);

  useEffect(() => {
    if (isExpanded) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isExpanded]);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mt-4 border rounded-md">
      <Button
        onClick={toggleExpand}
        variant="ghost"
        className="w-full flex justify-between items-center p-2"
      >
        <span>Pipe Logs</span>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </Button>
      {isExpanded && (
        <div className="p-2">
          <CodeBlock language="log" value={logs.join("\n")} />
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
};

export default PipeLogger;
