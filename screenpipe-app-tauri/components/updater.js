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
exports.checkForAppUpdates = checkForAppUpdates;
const plugin_updater_1 = require("@tauri-apps/plugin-updater");
const plugin_dialog_1 = require("@tauri-apps/plugin-dialog");
const plugin_process_1 = require("@tauri-apps/plugin-process");
const core_1 = require("@tauri-apps/api/core");
const plugin_os_1 = require("@tauri-apps/plugin-os");
function checkForAppUpdates(_a) {
    return __awaiter(this, arguments, void 0, function* ({ toast }) {
        const update = yield (0, plugin_updater_1.check)();
        if (update === null || update === void 0 ? void 0 : update.available) {
            const yes = yield (0, plugin_dialog_1.ask)(`
Update to ${update.version} is available!
Release notes: ${update.body}
        `, {
                title: "Update Now!",
                kind: "info",
                okLabel: "Update",
                cancelLabel: "Cancel",
            });
            if (yes) {
                // on windows only - TODO shouldnt be necessary
                const os = (0, plugin_os_1.platform)();
                if (os === "windows") {
                    yield (0, core_1.invoke)("stop_screenpipe");
                }
                const toastId = toast({
                    title: "Updating...",
                    description: "Downloading and installing update",
                    duration: Infinity,
                });
                try {
                    yield update.downloadAndInstall();
                    toast({
                        id: toastId,
                        title: "Update complete",
                        description: "Relaunching application",
                        duration: 3000,
                    });
                    yield (0, plugin_process_1.relaunch)();
                }
                catch (error) {
                    toast({
                        id: toastId,
                        title: "Update failed",
                        description: "An error occurred during the update",
                        variant: "destructive",
                        duration: 5000,
                    });
                }
            }
        }
    });
}
