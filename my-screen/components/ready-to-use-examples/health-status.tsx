"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Loader2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function HealthStatus({ 
  onDataChange,
  endpoint = "http://localhost:3030/health" // Default fallback endpoint
}: { 
  onDataChange: (data: any, error: string | null) => void,
  endpoint?: string
}) {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchHealth = useCallback(async () => {
    try {
      const startTime = performance.now();
      const response = await fetch(endpoint);
      const requestTime = performance.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`Failed to fetch health data: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update local state
      setHealth(data);
      setLoading(false);
      
      // Call the callback with the data and metadata
      onDataChange(data, null);
      
    } catch (err) {
      // Provide better error messages for common network errors
      let errorMessage = "Unknown error occurred";
      
      if (err instanceof Error) {
        // Check for network connectivity errors
        if (err.message.includes('Failed to fetch') || 
            err.message.includes('NetworkError') ||
            err.message.includes('ERR_CONNECTION_REFUSED')) {
          errorMessage = "Connection refused. The health endpoint is unreachable.";
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setLoading(false);
      
      // Call the callback with the error
      onDataChange(null, errorMessage);
    }
  }, [endpoint, onDataChange]);

  // Fetch health data when component mounts
  useEffect(() => {
    console.log("component mounted, fetching initial health data");
    fetchHealth();
  }, [fetchHealth, retryCount]);

  // Add a separate effect to handle changes to onDataChange if needed
  useEffect(() => {
    console.log("health data callback changed");
    // Only re-fetch if the callback changes and we already have data
    if (health) {
      onDataChange?.(health, null);
    }
  }, [onDataChange, health]);

  // Helper function to determine status icon and color
  const getStatusInfo = (status: string) => {
    switch(status?.toLowerCase()) {
      case "healthy":
      case "ok":
      case "up":
      case "running":
        return { icon: <CheckCircle className="h-5 w-5" />, color: "text-green-500", bg: "bg-green-50" };
      case "warning":
      case "degraded":
        return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-500", bg: "bg-amber-50" };
      case "error":
      case "down":
      case "critical":
        return { icon: <XCircle className="h-5 w-5" />, color: "text-red-500", bg: "bg-red-50" };
      default:
        return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-slate-500", bg: "bg-slate-50" };
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">system status</h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setRetryCount(prev => prev + 1)} 
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              checking...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              refresh
            </>
          )}
        </Button>
      </div>

      {error ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-md bg-destructive/15 p-4"
        >
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-destructive mr-2 mt-0.5" />
            <div>
              <h3 className="font-medium text-destructive">connection error</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {error} Make sure the screenpipe service is running.
              </p>
            </div>
          </div>
        </motion.div>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : health ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Overall status */}
          {health.status && (
            <motion.div 
              className={`p-4 rounded-md flex items-center ${getStatusInfo(health.status).bg}`}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <div className={`mr-3 ${getStatusInfo(health.status).color}`}>
                {getStatusInfo(health.status).icon}
              </div>
              <div>
                <div className="font-medium">overall status</div>
                <div className={`${getStatusInfo(health.status).color}`}>{health.status}</div>
              </div>
            </motion.div>
          )}

          {/* Services/Components */}
          {health.services && (
            <motion.div 
              className="bg-white rounded-md border overflow-hidden"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="p-3 border-b bg-slate-50">
                <h3 className="font-medium">services</h3>
              </div>
              <div className="divide-y">
                {Object.entries(health.services).map(([name, info]: [string, any], index) => (
                  <motion.div 
                    key={name}
                    className="p-3 flex items-center justify-between"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + (index * 0.05) }}
                  >
                    <div className="flex items-center">
                      <div className={`mr-3 ${getStatusInfo(info.status).color}`}>
                        {getStatusInfo(info.status).icon}
                      </div>
                      <div>{name}</div>
                    </div>
                    <Badge variant={info.status === "healthy" ? "outline" : "destructive"}>
                      {info.status}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* System Info */}
          {health.system && (
            <motion.div 
              className="bg-white rounded-md border overflow-hidden"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="p-3 border-b bg-slate-50">
                <h3 className="font-medium">system info</h3>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(health.system).map(([key, value]: [string, any]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-slate-500">{key}:</span>
                    <span className="font-mono">{value?.toString()}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      ) : (
        <div className="text-center p-4 text-muted-foreground">
          no health data available
        </div>
      )}
    </div>
  );
} 