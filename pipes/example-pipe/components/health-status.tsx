"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export function HealthStatus({ onHealthDataChange }: { onHealthDataChange?: (data: any, error: string | null) => void }) {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wrap fetchHealth in useCallback to prevent unnecessary re-renders
  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("fetching health data...");
      
      // Capture the start time for logging
      const startTime = performance.now();
      const response = await fetch("http://localhost:3030/health");
      const endTime = performance.now();
      console.log(`health request completed in ${(endTime - startTime).toFixed(2)}ms`);
      
      if (!response.ok) {
        throw new Error(`health api returned ${response.status}`);
      }
      
      const data = await response.json();
      console.log("health data received:", data);
      setHealth(data);
      
      // Notify parent component about the new health data
      if (onHealthDataChange) {
        onHealthDataChange(data, null);
      }
    } catch (err) {
      console.error("error fetching health data:", err);
      const errorMsg = err instanceof Error ? err.message : "unknown error occurred";
      setError(errorMsg);
      
      // Notify parent component about the error
      if (onHealthDataChange) {
        onHealthDataChange(null, errorMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [onHealthDataChange]);

  // Fetch health data when component mounts
  useEffect(() => {
    console.log("component mounted, fetching initial health data");
    fetchHealth();
    // Remove fetchHealth from the dependency array to prevent re-fetching on every render
  }, []); // Empty dependency array - only run on mount

  // Add a separate effect to handle changes to onHealthDataChange if needed
  useEffect(() => {
    console.log("health data callback changed");
    // Only re-fetch if the callback changes and we already have data
    if (health) {
      onHealthDataChange?.(health, null);
    }
  }, [onHealthDataChange, health]);

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
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">system health</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchHealth} 
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {health ? "refresh" : "fetch health data"}
        </Button>
      </div>
      
      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 mb-4 border border-red-300 bg-red-50 text-red-700 rounded-md"
        >
          {error}
        </motion.div>
      )}
      
      {loading && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 border rounded-md animate-pulse bg-slate-100"
        >
          loading health data...
        </motion.div>
      )}
      
      {health && !loading && (
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
      )}
    </div>
  );
} 