import React, { useEffect } from "react";
import {
  isPermissionGranted,
  onAction,
  registerActionTypes,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { commands } from "@/types/tauri";

const ScreenpipeInstanceChecker: React.FC = () => {
  useEffect(() => {
    const checkInstances = async () => {
      try {
        // Check notification permission
        let permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          permissionGranted = permission === "granted";
        }

        onAction(async (event) => {
          console.log("Action received:", event);
          if (event.actionTypeId === "is_running_multiple_instances") {
            console.log("Action received:", event);

            await commands.killAllSreenpipes();
            // sleep 2s
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await commands.spawnScreenpipe();
            sendNotification({
              title: "Screenpipe Restarted",
              body: "All instances have been stopped and Screenpipe has been restarted.",
            });
          }
        });

        registerActionTypes([
          {
            id: "is_running_multiple_instances",
            actions: [
              {
                id: "stop_all_and_restart",
                title: "Stop All and Restart",
              },
            ],
          },
        ]);

        if (!permissionGranted) {
          console.log("Notification permission not granted");
          return;
        }

        // TODO: fix this unimplemented function
        // const multipleInstances = await invoke<boolean>(
        //   "is_running_multiple_instances"
        // );

        const multipleInstances = false;

        if (multipleInstances) {
          sendNotification({
            title: "Multiple Screenpipe Instances Detected",
            body: "Stop all and restart?",
            actionTypeId: "is_running_multiple_instances",
          });
        }
      } catch (error) {
        console.error("Error checking instances:", error);
      }
    };

    checkInstances();
  }, []);

  return null;
};

export default ScreenpipeInstanceChecker;
