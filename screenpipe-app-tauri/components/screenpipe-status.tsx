"use client";
import React from "react";
import { Badge } from "./ui/badge";
import { Power, TriangleAlert } from "lucide-react";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { useScreenpipeStatus } from "./screenpipe-status/context";
import { SystemStatus } from "@/lib/hooks/use-health-check";

const HealthStatus = () => {
  const { isLoading, health } = useScreenpipeStatus();
  const { open } = useStatusDialog();

  return (
    <Badge 
      variant="default"
      data-status={health?.status}
      className={"cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"}
      onClick={open}
    >
      { health?.status === SystemStatus.WEBSOCKET_CLOSED ? (
        <TriangleAlert className="mr-2 h-4 w-4" />
      ) : (
        <Power className="mr-2 h-4 w-4" />
      )}
      <span
        data-status={isLoading ? "loading" : health?.status}
        className={`ml-1 w-2 h-2 rounded-full inline-block 
          animate-pulse 
          data-[status=healthy]:bg-green-500 
          data-[status=unhealthy]:bg-red-500 
          data-[status=error]:bg-red-500
          data-[status=websocket_closed]:bg-yellow-300
          data-[status=loading]:bg-gray-500
          `
        }
      />
    </Badge>
  );
};


export default HealthStatus;
