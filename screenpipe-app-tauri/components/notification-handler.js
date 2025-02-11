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
const event_1 = require("@tauri-apps/api/event");
const NotificationHandler = () => {
    (0, react_1.useEffect)(() => {
        const checkAndRequestPermission = () => __awaiter(void 0, void 0, void 0, function* () {
            let permission = yield (0, plugin_notification_1.isPermissionGranted)();
            if (!permission) {
                const result = yield (0, plugin_notification_1.requestPermission)();
                permission = result === "granted";
            }
            if (permission) {
                const welcomeShown = localStorage.getItem("welcomeNotificationShown");
                if (!welcomeShown) {
                    (0, plugin_notification_1.sendNotification)({
                        title: "welcome to screenpipe",
                        body: "thank you for using screenpipe! we're dedicated to help you get the most out of screenpipe.",
                    });
                    localStorage.setItem("welcomeNotificationShown", "true");
                }
            }
            (0, event_1.listen)("notification-requested", (event) => {
                console.log(`notification requested ${event.payload.title} ${event.payload.body}`);
                (0, plugin_notification_1.sendNotification)({
                    title: event.payload.title,
                    body: event.payload.body,
                });
            });
        });
        checkAndRequestPermission();
    }, []);
    return null; // This component doesn't render anything
};
exports.default = NotificationHandler;
