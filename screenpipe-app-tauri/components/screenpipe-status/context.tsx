import React, { createContext, useContext, useState, useEffect } from "react";
import { usePermissions } from "./use-permissions";
import { PermissionDevices, PermissionsStatesPerDevice } from "./types";
import { useOnboarding } from "../onboarding/context";
import { HealthCheckResponse, useHealthCheck } from "@/lib/hooks/use-health-check";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { useSettings } from "@/lib/hooks/use-settings";

type ScreenpipeStatusContextType = {
  permissions: PermissionsStatesPerDevice | null;
  isMacOS: boolean;
  checkPermissions: () => Promise<PermissionsStatesPerDevice | undefined>;
  handlePermissionButton: (type: PermissionDevices) => Promise<void>;
  health: HealthCheckResponse | null;
  isServerDown: boolean;
  isLoading: boolean;
}

const ScreenpipeStatusContext = createContext<ScreenpipeStatusContextType | undefined>(
  undefined
);

export const ScreenpipeStatusProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
    const { permissions, checkPermissions, isMacOS, handlePermissionButton } = usePermissions();
    const { health, isServerDown, isLoading, fetchHealth } = useHealthCheck();
    const { open } = useStatusDialog();

    // if health is down, open the status dialog
    // if permissions are not granted, open the permissions dialog
    // if permissions are broken open dialog
    // if showOnboarding is true do not open any dialog


    return (
      <ScreenpipeStatusContext.Provider value={{ 
          permissions,
          isMacOS,
          checkPermissions,
          handlePermissionButton,
          health,
          isServerDown,
          isLoading,
      }}>
        <button onClick={() => open()}>
          hahaha
        </button>
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
