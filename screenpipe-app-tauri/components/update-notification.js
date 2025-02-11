"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const plugin_notification_1 = require("@tauri-apps/plugin-notification");
const plugin_os_1 = require("@tauri-apps/plugin-os");
const UpdateNotification = ({ checkIntervalHours = 3, }) => {
    (0, react_1.useEffect)(() => {
        const checkForUpdates = () => __awaiter(void 0, void 0, void 0, function* () {
            const lastCheckTime = localStorage.getItem("lastUpdateCheckTime");
            const currentTime = Date.now();
            if (!lastCheckTime ||
                currentTime - parseInt(lastCheckTime) > checkIntervalHours * 3600000) {
                const os = (0, plugin_os_1.platform)();
                const releasePageUrl = "https://web.crabnebula.cloud/mediar/screenpipe/releases";
                try {
                    const response = yield fetch(releasePageUrl);
                    const html = yield response.text();
                    // Extract download links
                    const links = html.match(/https:\/\/cdn\.crabnebula\.app\/download\/mediar\/screenpipe\/latest[^\s"']*/g) || [];
                    let downloadLink = "";
                    if (os === "windows") {
                        downloadLink =
                            links.find((link) => link.includes("nsis-x86_64")) || "";
                    }
                    else if (os === "macos") {
                        // For macOS, we can't determine ARM vs Intel, so we'll provide both options
                        const armLink = links.find((link) => link.includes("aarch64.dmg")) || "";
                        const intelLink = links.find((link) => link.includes("x64.dmg")) || "";
                        downloadLink = `ARM: ${armLink}\nIntel: ${intelLink}`;
                    }
                    if (downloadLink) {
                        (0, plugin_notification_1.sendNotification)({
                            title: "Screenpipe Update Available",
                            body: `A new version of Screenpipe is available. Click to download:\n${downloadLink}`,
                            //   icon: "update-icon", // Replace with your update icon
                        });
                    }
                }
                catch (error) {
                    console.error("Error checking for updates:", error);
                }
                localStorage.setItem("lastUpdateCheckTime", currentTime.toString());
            }
        });
        checkForUpdates();
        const interval = setInterval(checkForUpdates, checkIntervalHours * 3600000);
        return () => clearInterval(interval);
    }, [checkIntervalHours]);
    return null;
};
exports.default = UpdateNotification;
