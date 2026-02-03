import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import localforage from "localforage";

const FIRST_RUN_NOTIFICATION_KEY = "firstRunNotificationScheduled";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Schedule a notification 2 hours after first run to remind users to check their timeline.
 * This only fires ONCE - on the first time the user completes onboarding.
 */
export async function scheduleFirstRunNotification(): Promise<void> {
  try {
    // Check if we already scheduled this notification
    const alreadyScheduled = await localforage.getItem<boolean>(
      FIRST_RUN_NOTIFICATION_KEY
    );
    if (alreadyScheduled) {
      console.log("First run notification already scheduled, skipping");
      return;
    }

    // Mark as scheduled immediately to prevent duplicates
    await localforage.setItem(FIRST_RUN_NOTIFICATION_KEY, true);

    // Check/request notification permission
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
    }

    if (!permissionGranted) {
      console.log("Notification permission not granted");
      return;
    }

    // Schedule notification for 2 hours from now
    setTimeout(() => {
      sendNotification({
        title: "Your screen history is ready",
        body: "You have 2 hours of activity recorded. Open screenpipe to search or ask AI about what you did.",
      });
      console.log("First run notification sent");
    }, TWO_HOURS_MS);

    console.log("First run notification scheduled for 2 hours from now");
  } catch (error) {
    console.error("Failed to schedule first run notification:", error);
  }
}
