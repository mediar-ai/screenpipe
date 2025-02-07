import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import React, { createContext, useContext, useState, useEffect } from "react";
import { toast } from "@/components/ui/use-toast";
import { usePermissions } from "./use-permissions";
import { PermissionDevices, PermissionsStatesPerDevice } from "./types";
import { useOnboarding } from "../onboarding/context";
import { Dialog, DialogContent } from "../ui/dialog";

type ScreenpipeStatusContextType = {
  permissions: PermissionsStatesPerDevice | null;
  isMacOS: boolean;
  checkPermissions: () => Promise<PermissionsStatesPerDevice | undefined>;
  handlePermissionButton: (type: PermissionDevices) => Promise<void>;
}

const ScreenpipeStatusContext = createContext<ScreenpipeStatusContextType | undefined>(
  undefined
);

export const ScreenpipeStatusProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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
