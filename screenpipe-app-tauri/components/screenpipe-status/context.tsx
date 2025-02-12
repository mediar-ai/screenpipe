import React, { createContext, useContext, useState, useEffect } from "react";
import { usePermissions } from "./use-permissions";
import { PermissionDevices, PermissionsStates, PermissionsStatesPerDevice } from "./types";
import { HealthCheckResponse, useHealthCheck, SystemStatus } from "@/lib/hooks/use-health-check";
import { useStatusDialog } from "@/lib/hooks/use-status-dialog";
import { useOnboarding } from "../onboarding/context";

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
    const { health, isServerDown, isLoading } = useHealthCheck();
    const { open } = useStatusDialog();
    const { showOnboarding } = useOnboarding();

    console.log("health", health);

    useEffect(() => {
      // if showOnboarding do not open any dialog
      if (showOnboarding) {
        return;
      }

      // if health is down, open the status dialog
      if (health?.status === SystemStatus.UNHEALTHY || health?.status === SystemStatus.ERROR) {
        open();
      }

      // if permissions are broken open dialog
      if (permissions?.microphone === PermissionsStates.DENIED ||
          permissions?.screenRecording === PermissionsStates.DENIED ||
          permissions?.accessibility === PermissionsStates.DENIED
      ) {
        open();
      }

      // if permissions are empty, open the permissions dialog
      if (permissions?.microphone === PermissionsStates.EMPTY ||
          permissions?.screenRecording === PermissionsStates.EMPTY ||
          permissions?.accessibility === PermissionsStates.EMPTY
      ) {
        open();
      }

    }, [health, permissions]);

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
