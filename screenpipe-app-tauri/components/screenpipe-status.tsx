"use client";
import React from "react";
import { Badge } from "./ui/badge";
import { Power, TriangleAlert } from "lucide-react";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { useScreenpipeStatus } from "./screenpipe-status/context";

const HealthStatus = () => {
  const { isLoading, isServerDown } = useScreenpipeStatus();

  if (isLoading) {
    return <LoadingBadge />
  }

  return (
    <>
      { isServerDown ? (
        <ServerDownBadge />
      ) : (
        <ServerUpBadge />
      )}
    </>
  );
};

function ServerDownBadge() {
  const { open } = useStatusDialog();

  return (
    <Badge 
      variant="default" 
      className="cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={open}
    >
      <TriangleAlert className="mr-2 h-4 w-4" />
      <span
        className={`ml-1 w-2 h-2 rounded-full animate-pulse  inline-block bg-yellow-300`}
      />
    </Badge>
  );
}

function ServerUpBadge() {
  const { health } = useScreenpipeStatus();
  const { open } = useStatusDialog();

  return (
    <Badge 
      variant="default" 
      className="cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={open}
    >
      <Power className="mr-2 h-4 w-4" />
      <span
        data-status={health?.status}
        className={`ml-1 w-2 h-2 rounded-full inline-block 
          data-[status=unhealthy]:animate-pulse 
          data-[status=error]:animate-pulse 
          data-[status=healthy]:bg-green-500 
          data-[status=unhealthy]:bg-red-500 
          data-[status=error]:bg-red-500`
        }
      />
    </Badge>
  );
}

function LoadingBadge() {
  return (
    <Badge variant="default" className="cursor-pointer bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground">
      <span className="ml-1 w-2 h-2 rounded-full inline-block animate-pulse bg-gray-500" />
    </Badge>
  );
}

export default HealthStatus;
