import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import React, { createContext, useContext, useState, useEffect } from "react";
import { toast } from "@/components/ui/use-toast";
import { usePermissions } from "./use-permissions";
import { PermissionDevices, PermissionsStatesPerDevice } from "./types";
import { useOnboarding } from "../onboarding/context";

type InputDevicesContextType = {
  permissions: PermissionsStatesPerDevice | null;
  isMacOS: boolean;
  checkPermissions: () => Promise<PermissionsStatesPerDevice | undefined>;
  handlePermissionButton: (type: PermissionDevices) => Promise<void>;
}

const InputDevicesContext = createContext<InputDevicesContextType | undefined>(
  undefined
);

export const InputDevicesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
    const { permissions, checkPermissions, isMacOS, handlePermissionButton } = usePermissions();
    
    useEffect(() => {
        checkPermissions();
    }, []);

    return (
      <InputDevicesContext.Provider value={{ 
          permissions,
          isMacOS,
          checkPermissions,
          handlePermissionButton,
      }}>
          {children}
      </InputDevicesContext.Provider>
    );
};

export const useInputDevices = () => {
  const context = useContext(InputDevicesContext);
  if (context === undefined) {
    throw new Error("useInputDevices must be used within an InputDevicesProvider");
  }
  return context;
};
