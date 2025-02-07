import React, { createContext, useContext, useState, useEffect } from "react";
import { usePermissions } from "./use-permissions";
import { PermissionDevices, PermissionsStatesPerDevice } from "./types";
import { useOnboarding } from "../onboarding/context";
import { HealthCheckResponse, useHealthCheck } from "@/lib/hooks/use-health-check";

type ScreenpipeStatusContextType = {
  permissions: PermissionsStatesPerDevice | null;
  isMacOS: boolean;
  checkPermissions: () => Promise<PermissionsStatesPerDevice | undefined>;
  handlePermissionButton: (type: PermissionDevices) => Promise<void>;
  health: HealthCheckResponse | null;
}

const ScreenpipeStatusContext = createContext<ScreenpipeStatusContextType | undefined>(
  undefined
);

export const ScreenpipeStatusProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
    const { health, isServerDown, isLoading, fetchHealth, debouncedFetchHealth } = useHealthCheck();
    const { showOnboarding } = useOnboarding();
    const { permissions, checkPermissions, isMacOS, handlePermissionButton } = usePermissions();

    useEffect(() => {
        checkPermissions();
    }, []);

    return (
      <ScreenpipeStatusContext.Provider value={{ 
          permissions,
          isMacOS,
          checkPermissions,
          handlePermissionButton,
          health,
      }}>
          {children}
      </ScreenpipeStatusContext.Provider>
    );
};

export const useScreenpipeStatus = () => {
  const context = useContext(ScreenpipeStatusContext);
  if (context === undefined) {
    throw new Error("useScreenpipeStatus must be used within an ScreenpipeStatusProvider");
  }
  return context;
};
