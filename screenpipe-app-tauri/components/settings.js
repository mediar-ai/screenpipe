"use strict";
"use client";
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
exports.Settings = Settings;
const react_1 = __importStar(require("react"));
const use_settings_1 = require("@/lib/hooks/use-settings");
const lucide_react_1 = require("lucide-react");
const dialog_1 = require("./ui/dialog");
const utils_1 = require("@/lib/utils");
const recording_settings_1 = require("./recording-settings");
const account_section_1 = require("./settings/account-section");
const shortcut_section_1 = __importDefault(require("./settings/shortcut-section"));
const disk_usage_1 = __importDefault(require("./settings/disk-usage"));
const ai_section_1 = __importDefault(require("./settings/ai-section"));
const dropdown_menu_1 = require("./ui/dropdown-menu");
const input_1 = require("./ui/input");
const button_1 = require("./ui/button");
const plugin_process_1 = require("@tauri-apps/plugin-process");
const core_1 = require("@tauri-apps/api/core");
const use_profiles_1 = require("@/lib/hooks/use-profiles");
const use_toast_1 = require("./ui/use-toast");
const data_import_section_1 = require("./settings/data-import-section");
const dialog_2 = require("./ui/dialog");
const use_settings_dialog_1 = require("@/lib/hooks/use-settings-dialog");
function Settings() {
    const { isOpen, setIsOpen: setSettingsOpen } = (0, use_settings_dialog_1.useSettingsDialog)();
    const { profiles, activeProfile, createProfile, deleteProfile, setActiveProfile, } = (0, use_profiles_1.useProfiles)();
    const [activeSection, setActiveSection] = (0, react_1.useState)("account");
    const [isCreatingProfile, setIsCreatingProfile] = (0, react_1.useState)(false);
    const [newProfileName, setNewProfileName] = (0, react_1.useState)("");
    const { settings } = (0, use_settings_1.useSettings)();
    const handleProfileChange = () => __awaiter(this, void 0, void 0, function* () {
        (0, use_toast_1.toast)({
            title: "Restarting Screenpipe",
            description: "Please wait while we restart Screenpipe",
        });
        yield (0, core_1.invoke)("stop_screenpipe");
        yield new Promise((resolve) => setTimeout(resolve, 1000));
        yield (0, core_1.invoke)("spawn_screenpipe");
        yield new Promise((resolve) => setTimeout(resolve, 1000));
        (0, plugin_process_1.relaunch)();
    });
    const handleCreateProfile = () => __awaiter(this, void 0, void 0, function* () {
        if (newProfileName.trim() === "default") {
            (0, use_toast_1.toast)({
                title: "profile name is not allowed",
                description: "Please choose a different name for your profile",
            });
            return;
        }
        if (newProfileName.trim()) {
            console.log("creating profile", newProfileName.trim());
            createProfile({
                profileName: newProfileName.trim(),
                currentSettings: settings,
            });
            setActiveProfile(newProfileName.trim());
            setNewProfileName("");
            setIsCreatingProfile(false);
            handleProfileChange();
        }
    });
    const handleSwitchProfile = (profileName) => __awaiter(this, void 0, void 0, function* () {
        setActiveProfile(profileName);
        handleProfileChange();
    });
    const renderSection = () => {
        switch (activeSection) {
            case "ai":
                return <ai_section_1.default />;
            case "account":
                return <account_section_1.AccountSection />;
            case "recording":
                return <recording_settings_1.RecordingSettings />;
            case "shortcuts":
                return <shortcut_section_1.default />;
            case "diskUsage":
                return <disk_usage_1.default />;
            case "dataImport":
                return <data_import_section_1.DataImportSection />;
        }
    };
    (0, react_1.useEffect)(() => {
        console.log(profiles, "profiles");
    }, [profiles]);
    return (<dialog_2.Dialog modal={true} open={isOpen} onOpenChange={setSettingsOpen}>
      <dialog_2.DialogContent className="max-w-[80vw] w-full max-h-[80vh] h-full overflow-hidden p-0 [&>button]:hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-64 border-r bg-[#f3f3f3]">
            <dialog_1.DialogHeader className="flex items-center gap-4 ml-6 mt-4">
              <dialog_1.DialogTitle className="text-2xl font-bold">settings</dialog_1.DialogTitle>
            </dialog_1.DialogHeader>

            {/* Profile Selector */}
            <div className="px-4 py-3 border-b">
              <dropdown_menu_1.DropdownMenu>
                <dropdown_menu_1.DropdownMenuTrigger asChild>
                  <button_1.Button variant="outline" className="w-full justify-between font-mono text-sm">
                    {activeProfile}
                    <lucide_react_1.ChevronDown className="h-4 w-4 opacity-50"/>
                  </button_1.Button>
                </dropdown_menu_1.DropdownMenuTrigger>
                <dropdown_menu_1.DropdownMenuContent className="w-56">
                  {profiles === null || profiles === void 0 ? void 0 : profiles.map((profile) => (<dropdown_menu_1.DropdownMenuItem key={profile} className="justify-between" onSelect={() => handleSwitchProfile(profile)}>
                      <span className="font-mono">{profile}</span>
                      {activeProfile === profile && (<lucide_react_1.Check className="h-4 w-4"/>)}
                      {profile !== "default" && (<lucide_react_1.Trash2 className="h-4 w-4 opacity-50 hover:opacity-100" onClick={(e) => {
                    e.stopPropagation();
                    deleteProfile(profile);
                }}/>)}
                    </dropdown_menu_1.DropdownMenuItem>))}
                  <dropdown_menu_1.DropdownMenuSeparator />
                  {isCreatingProfile ? (<div className="p-2">
                      <form onSubmit={(e) => {
                e.preventDefault();
                handleCreateProfile();
            }} className="flex gap-2">
                        <input_1.Input value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="profile name" className="h-8 font-mono" autoFocus/>
                        <button_1.Button type="submit" size="sm" disabled={!newProfileName.trim()}>
                          <lucide_react_1.Check className="h-4 w-4"/>
                        </button_1.Button>
                      </form>
                    </div>) : (<dropdown_menu_1.DropdownMenuItem onSelect={(e) => {
                e.preventDefault();
                setIsCreatingProfile(true);
            }} className="gap-2">
                      <lucide_react_1.Plus className="h-4 w-4"/>
                      <span>new profile</span>
                    </dropdown_menu_1.DropdownMenuItem>)}
                </dropdown_menu_1.DropdownMenuContent>
              </dropdown_menu_1.DropdownMenu>
            </div>

            {/* Existing Settings Navigation */}
            <div className="flex flex-col space-y-1 p-4">
              {[
            {
                id: "account",
                label: "account",
                icon: <lucide_react_1.User className="h-4 w-4"/>,
            },
            {
                id: "ai",
                label: "ai settings",
                icon: <lucide_react_1.Brain className="h-4 w-4"/>,
            },
            {
                id: "recording",
                label: "recording",
                icon: <lucide_react_1.Video className="h-4 w-4"/>,
            },
            {
                id: "shortcuts",
                label: "shortcuts",
                icon: <lucide_react_1.Keyboard className="h-4 w-4"/>,
            },
            {
                id: "diskUsage",
                label: "disk usage",
                icon: <lucide_react_1.HardDrive className="h-4 w-4"/>,
            },
            {
                id: "dataImport",
                label: "data import",
                icon: <lucide_react_1.FolderInput className="h-4 w-4"/>,
            },
        ].map((section) => (<button key={section.id} onClick={() => setActiveSection(section.id)} className={(0, utils_1.cn)("flex items-center space-x-2 px-4 py-1.5 rounded-lg transition-colors", activeSection === section.id
                ? "bg-black/90 text-white"
                : "hover:bg-black/10")}>
                  {section.icon}
                  <span>{section.label}</span>
                </button>))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col h-full max-h-[80vh]">
            <div className="flex-1 overflow-y-auto px-4">
              <div className="max-h-full">{renderSection()}</div>
            </div>
          </div>
        </div>
      </dialog_2.DialogContent>
    </dialog_2.Dialog>);
}
