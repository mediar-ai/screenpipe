import React, { useEffect, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  ScheduleEvery,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const NotificationHandler: React.FC = () => {
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    const checkAndRequestPermission = async () => {
      let permission = await isPermissionGranted();
      console.log("notifcation permission", permission);

      if (!permission) {
        const result = await requestPermission();
        permission = result === "granted";
      }

      setPermissionGranted(permission);

      if (permission) {
        sendNotification({
          title: "Welcome to Screenpipe",
          body: "Thank you for using Screenpipe! We're dedicated to help you get the most out of screenpipe.",
        });
      }
    };

    checkAndRequestPermission();
  }, []);

  return null; // This component doesn't render anything
};

export default NotificationHandler;
