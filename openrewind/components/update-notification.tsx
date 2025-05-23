import React, { useEffect, useState } from "react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { platform } from "@tauri-apps/plugin-os";

const UpdateNotification: React.FC<{ checkIntervalHours: number }> = ({
  checkIntervalHours = 3,
}) => {
  useEffect(() => {
    const checkForUpdates = async () => {
      const lastCheckTime = localStorage.getItem("lastUpdateCheckTime");
      const currentTime = Date.now();

      if (
        !lastCheckTime ||
        currentTime - parseInt(lastCheckTime) > checkIntervalHours * 3600000
      ) {
        const os = platform();
        const releasePageUrl =
          "https://web.crabnebula.cloud/mediar/screenpipe/releases";

        try {
          const response = await fetch(releasePageUrl);
          const html = await response.text();

          // Extract download links
          const links =
            html.match(
              /https:\/\/cdn\.crabnebula\.app\/download\/mediar\/screenpipe\/latest[^\s"']*/g
            ) || [];

          let downloadLink = "";
          if (os === "windows") {
            downloadLink =
              links.find((link) => link.includes("nsis-x86_64")) || "";
          } else if (os === "macos") {
            // For macOS, we can't determine ARM vs Intel, so we'll provide both options
            const armLink =
              links.find((link) => link.includes("aarch64.dmg")) || "";
            const intelLink =
              links.find((link) => link.includes("x64.dmg")) || "";
            downloadLink = `ARM: ${armLink}\nIntel: ${intelLink}`;
          }

          if (downloadLink) {
            sendNotification({
              title: "Screenpipe Update Available",
              body: `A new version of Screenpipe is available. Click to download:\n${downloadLink}`,
              //   icon: "update-icon", // Replace with your update icon
            });
          }
        } catch (error) {
          console.error("Error checking for updates:", error);
        }

        localStorage.setItem("lastUpdateCheckTime", currentTime.toString());
      }
    };

    checkForUpdates();
    const interval = setInterval(checkForUpdates, checkIntervalHours * 3600000);

    return () => clearInterval(interval);
  }, [checkIntervalHours]);

  return null;
};

export default UpdateNotification;
