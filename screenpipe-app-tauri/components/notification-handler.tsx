import React, { useEffect, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  ScheduleEvery,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { listen } from "@tauri-apps/api/event";

type NotificationRequested = {
  title: string;
  body: string;
};

const NotificationHandler: React.FC = () => {
  useEffect(() => {
    const checkAndRequestPermission = async () => {
      let permission = await isPermissionGranted();
      console.log("notification permission", permission);

      if (!permission) {
        const result = await requestPermission();
        permission = result === "granted";
      }

      if (permission) {
        const welcomeShown = localStorage.getItem("welcomeNotificationShown");

        if (!welcomeShown) {
          sendNotification({
            title: "welcome to screenpipe",
            body: "thank you for using screenpipe! we're dedicated to help you get the most out of screenpipe.",
          });
          localStorage.setItem("welcomeNotificationShown", "true");
        }
      }

      listen<NotificationRequested>("notification-requested", (event) => {
        console.log(
          `notification requested ${event.payload.title} ${event.payload.body}`
        );
        sendNotification({
          title: event.payload.title,
          body: event.payload.body,
        });
      });
    };

    listen<string>("recording_failed", (event) => {
      console.log(`recording failed ${event.payload}`);
      sendNotification({
        title: "Screenpipe",
        body: event.payload,
      });
    });

    listen<string>("recording_started", (event) => {
      console.log(`recording started ${event.payload}`);
      sendNotification({
        title: "Screenpipe",
        body: event.payload,
      });
    });

    listen<string>("recording_stopped", (event) => {
      console.log(`recording stopped ${event.payload}`);
      sendNotification({
        title: "Screenpipe",
        body: event.payload,
      });
    });

    checkAndRequestPermission();
  }, []);

  return null; // This component doesn't render anything
};

export default NotificationHandler;
