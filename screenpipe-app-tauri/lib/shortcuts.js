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
exports.registerShortcuts = registerShortcuts;
const core_1 = require("@tauri-apps/api/core");
const use_settings_1 = require("./hooks/use-settings");
function registerShortcuts(_a) {
    return __awaiter(this, arguments, void 0, function* ({ showScreenpipeShortcut, disabledShortcuts, }) {
        (0, core_1.invoke)("update_show_screenpipe_shortcut", {
            new_shortcut: showScreenpipeShortcut,
            enabled: !disabledShortcuts.includes(use_settings_1.Shortcut.SHOW_SCREENPIPE),
        });
    });
}
