import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { PermissionDevices, PermissionsStatesPerDevice } from "./types";
import { platform } from "@tauri-apps/plugin-os";
import { toast } from "../ui/use-toast";
import { useOnboarding } from "../onboarding/context";

export function usePermissions() {
    const [permissions, setPermissions] = useState<PermissionsStatesPerDevice | null>(null);
    const [isMacOS, setIsMacOS] = useState(false);
    const { setRestartPending } = useOnboarding();

    async function checkPermissions() {
        try {
          console.log("checking permissions")
          const perms = await invoke<PermissionsStatesPerDevice>("do_permissions_check", {
            initialCheck: true,
          });
          setPermissions(perms);

          return perms
        } catch (error) {
          console.error("Failed to check permissions:", error);
        }
    };

    const handlePermissionButton = async (
        type: PermissionDevices
      ) => {
        const toastId = toast({
          title: `checking ${type} permissions`,
          description: "please wait...",
          duration: Infinity,
        });
    
        try {
          const os = platform();
    
          if (os !== "macos") return
    
          await invoke("request_permission", {
            permission: type,
          });
    
          // Only handle macOS screen recording special case after requesting permission
          if (type === PermissionDevices.SCREEN_RECORDING) {
            await setRestartPending();
            toast({
              title: "restart required",
              description:
                "please restart the app after enabling screen recording permission",
              duration: 10000,
            });
            return;
          }

          // invoke "request_permission" returns as soon as permissions apple dialog is opened
          // we wait 3 seconds before checking permissions after dialog is opened
          // giving user time to grant permissions before we check
          // otherwise the check will go immidiately, even as user is still granting permissions
          await new Promise(resolve => setTimeout(resolve, 3000));

          let perms: PermissionsStatesPerDevice | undefined;

          // trigger 6 checks in a loop, 500ms apart
          // this gives system time to update permissions
          for (let i = 0; i < 6; i++) {
            perms = await checkPermissions();
            if (!perms) {
              throw new Error("failed to check permissions");
            };

            // if the permission is granted, break the entire loop
            if (perms[type].toLowerCase() === "granted") {
              i = 7
              break;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
          }

          if (!perms) {
            throw new Error("failed to check permissions");
          }
    
          const granted = perms[type].toLowerCase() === "granted"
    
          toastId.update({
            id: toastId.id,
            title: granted ? "permission granted" : "permission check complete",
            description: granted
              ? `${type} permission was successfully granted`
              : `please try granting ${type} permission again if needed`,
            duration: 3000,
          });
    
        } catch (error) {
          console.error(`failed to handle ${type} permission:`, error);
          toastId.update({
            id: toastId.id,
            title: "error",
            description: `failed to handle ${type} permission`,
            duration: 3000,
          });
        }
    };

    useEffect(() => {
        const checkPlatform = () => {
          const currentPlatform = platform();
          setIsMacOS(currentPlatform === "macos");
        };
        checkPlatform();
    }, []);

    useEffect(() => {
      checkPermissions();
    }, []);

    return {
        permissions,
        checkPermissions,
        isMacOS,
        handlePermissionButton,
    };
}