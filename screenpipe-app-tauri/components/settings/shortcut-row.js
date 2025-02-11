"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const use_settings_1 = require("@/lib/hooks/use-settings");
const use_profiles_1 = require("@/lib/hooks/use-profiles");
const utils_1 = require("@/lib/utils");
const switch_1 = require("@/components/ui/switch");
const use_toast_1 = require("@/components/ui/use-toast");
const utils_2 = require("@/lib/utils");
const lucide_react_1 = require("lucide-react");
const core_1 = require("@tauri-apps/api/core");
const hotkeys_js_1 = __importDefault(require("hotkeys-js"));
var ShortcutState;
(function (ShortcutState) {
    ShortcutState["ENABLED"] = "enabled";
    ShortcutState["DISABLED"] = "disabled";
    ShortcutState["UNASSIGNED"] = "unassigned";
})(ShortcutState || (ShortcutState = {}));
const ShortcutRow = ({ shortcut, title, description, type, value, }) => {
    const [isRecording, setIsRecording] = (0, react_1.useState)(false);
    const { settings, updateSettings } = (0, use_settings_1.useSettings)();
    const { profileShortcuts, updateProfileShortcut } = (0, use_profiles_1.useProfiles)();
    (0, react_1.useEffect)(() => {
        if (!isRecording)
            return;
        const handleKeyDown = (event) => {
            event.preventDefault();
            const MODIFIER_KEYS = ["SUPER", "CTRL", "ALT", "SHIFT"];
            const KEY_CODE_MAP = {
                91: "SUPER",
                93: "SUPER",
                16: "SHIFT",
                17: "CTRL",
                18: "ALT",
            };
            const pressedKeys = hotkeys_js_1.default
                .getPressedKeyCodes()
                .map((code) => KEY_CODE_MAP[code] || String.fromCharCode(code))
                .filter((value, index, self) => self.indexOf(value) === index);
            const modifiers = pressedKeys.filter((k) => MODIFIER_KEYS.includes(k));
            const normalKeys = pressedKeys.filter((k) => !MODIFIER_KEYS.includes(k));
            const finalKeys = [...modifiers, ...normalKeys];
            if (normalKeys.length > 0) {
                handleEnableShortcut(finalKeys.join("+"));
                setIsRecording(false);
            }
        };
        hotkeys_js_1.default.filter = () => true;
        (0, hotkeys_js_1.default)("*", handleKeyDown);
        return () => {
            setIsRecording(false);
            hotkeys_js_1.default.unbind("*");
            hotkeys_js_1.default.filter = (event) => {
                const target = (event.target || event.srcElement);
                return !(target.isContentEditable ||
                    target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA");
            };
        };
    }, [isRecording]);
    const syncShortcuts = (updatedShortcuts) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("syncing shortcuts:", {
            showShortcut: updatedShortcuts.showScreenpipeShortcut,
            startShortcut: updatedShortcuts.startRecordingShortcut,
            stopShortcut: updatedShortcuts.stopRecordingShortcut,
            startAudioShortcut: updatedShortcuts.startAudioShortcut,
            stopAudioShortcut: updatedShortcuts.stopAudioShortcut,
            profileShortcuts: updatedShortcuts.profileShortcuts,
            pipeShortcuts: updatedShortcuts.pipeShortcuts,
        });
        // wait 1 second
        yield new Promise((resolve) => setTimeout(resolve, 1000));
        yield (0, core_1.invoke)("update_global_shortcuts", {
            showShortcut: updatedShortcuts.showScreenpipeShortcut,
            startShortcut: updatedShortcuts.startRecordingShortcut,
            stopShortcut: updatedShortcuts.stopRecordingShortcut,
            startAudioShortcut: updatedShortcuts.startAudioShortcut,
            stopAudioShortcut: updatedShortcuts.stopAudioShortcut,
            profileShortcuts: updatedShortcuts.profileShortcuts,
            pipeShortcuts: updatedShortcuts.pipeShortcuts,
        });
        return true;
    });
    const handleEnableShortcut = (keys) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            (0, use_toast_1.toast)({
                title: "shortcut enabled",
                description: `${shortcut.replace(/_/g, " ")} enabled`,
            });
            // Remove from disabled shortcuts if it exists
            updateSettings({
                disabledShortcuts: settings.disabledShortcuts.filter((s) => s !== shortcut),
            });
            switch (type) {
                case "global":
                    updateSettings({ [shortcut]: keys });
                    yield syncShortcuts(Object.assign(Object.assign({}, settings), { [shortcut]: keys, profileShortcuts, pipeShortcuts: settings.pipeShortcuts }));
                    break;
                case "profile":
                    const profileId = shortcut.replace("profile_", "");
                    updateProfileShortcut({
                        profile: profileId,
                        shortcut: keys,
                    });
                    yield syncShortcuts(Object.assign(Object.assign({}, settings), { profileShortcuts: Object.assign(Object.assign({}, profileShortcuts), { [profileId]: keys }), pipeShortcuts: settings.pipeShortcuts }));
                    break;
                case "pipe":
                    const pipeId = shortcut.replace("pipe_", "");
                    updateSettings({
                        pipeShortcuts: Object.assign(Object.assign({}, settings.pipeShortcuts), { [pipeId]: keys }),
                    });
                    yield syncShortcuts(Object.assign(Object.assign({}, settings), { profileShortcuts, pipeShortcuts: Object.assign(Object.assign({}, settings.pipeShortcuts), { [pipeId]: keys }) }));
                    break;
            }
        }
        catch (error) {
            console.error("error updating shortcut", error);
            (0, use_toast_1.toast)({
                title: "error updating shortcut",
                description: "failed to register shortcut. please try a different combination.",
                variant: "destructive",
            });
        }
    });
    const handleDisableShortcut = () => __awaiter(void 0, void 0, void 0, function* () {
        (0, use_toast_1.toast)({
            title: "shortcut disabled",
            description: `${shortcut.replace(/_/g, " ")} disabled`,
        });
        updateSettings({
            disabledShortcuts: Array.from(new Set([...settings.disabledShortcuts, shortcut])),
        });
        yield syncShortcuts(Object.assign(Object.assign({}, settings), { profileShortcuts, pipeShortcuts: settings.pipeShortcuts }));
    });
    const isValueEmpty = (v) => !v || v.trim() === "";
    const currentKeys = isValueEmpty(value)
        ? ["Unassigned"]
        : (0, utils_1.parseKeyboardShortcut)(value || "").split("+");
    const getShortcutState = () => {
        if (isValueEmpty(value))
            return ShortcutState.UNASSIGNED;
        return settings.disabledShortcuts.includes(shortcut)
            ? ShortcutState.DISABLED
            : ShortcutState.ENABLED;
    };
    return (<div className="flex items-center justify-between">
      <div className="space-y-1">
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={() => setIsRecording(true)} className={(0, utils_2.cn)("relative min-w-[140px] rounded-md border px-3 py-2 text-sm", "bg-muted/50 hover:bg-muted/70 transition-colors", "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring", isRecording && "border-primary", !value && "text-muted-foreground")}>
          {isRecording ? (<span className="animate-pulse">recording...</span>) : (<span className="flex items-center justify-between gap-2">
              {currentKeys.map((key, i) => (<kbd key={i} className={(0, utils_2.cn)("px-1 rounded", value ? "bg-background/50" : "bg-transparent")}>
                  {key}
                </kbd>))}
              <lucide_react_1.Pencil className="h-3 w-3 opacity-50"/>
            </span>)}
        </button>

        <switch_1.Switch checked={getShortcutState() === ShortcutState.ENABLED} disabled={getShortcutState() === ShortcutState.UNASSIGNED} onCheckedChange={(checked) => __awaiter(void 0, void 0, void 0, function* () {
            if (checked && value) {
                console.log("re-enabling shortcut", value);
                yield handleEnableShortcut(value);
            }
            else {
                console.log("disabling shortcut", shortcut);
                yield handleDisableShortcut();
            }
        })}/>
      </div>
    </div>);
};
exports.default = ShortcutRow;
